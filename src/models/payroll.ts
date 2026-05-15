import { query } from '../config/database';

export enum PayrollStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    FAILED = 'failed',
    PARTIALLY_COMPLETED = 'partially_completed',
}

export interface Payroll {
    id: number;
    payroll_period: string;
    total_amount: number;
    total_employees: number;
    status: PayrollStatus;
    processed_count: number;
    failed_count: number;
    created_at: Date;
    updated_at: Date;
    processed_at?: Date;
}

export interface PayrollItem {
    id: number;
    payroll_id: number;
    employee_id: number;
    amount: number;
    status: PayrollStatus;
    transaction_reference?: string;
    error_message?: string;
    processed_at?: Date;
    created_at: Date;
    updated_at: Date;
}

export interface CreatePayrollInput {
    payroll_period: string;
    employee_ids?: number[];
}

export class PayrollModel {
    // Payroll model class methods will go here
    static async create(data: CreatePayrollInput): Promise<Payroll> {
        let employeeFilter = '';
        let queryParams: any[] = [];

        // Build filter for selective employee payrolls
        if (data.employee_ids && data.employee_ids.length > 0) {
            employeeFilter = `AND id = ANY($1::int[])`;
            queryParams = [data.employee_ids];
        }

        // Calculate aggregate statistics from employees table
        const employeeStats = await query(
            `SELECT COUNT(*) as count, COALESCE(SUM(salary), 0) as total
            FROM employees
            WHERE is_active = true ${employeeFilter}`,
            queryParams
        );

        const totalEmployees = parseInt(employeeStats.rows[0].count);
        const totalAmount = parseFloat(employeeStats.rows[0].total);

        // Create the payroll record
        const result = await query(
            `INSERT INTO payrolls (payroll_period, total_amount, total_employees, status)
            VALUES ($1, $2, $3, $4)
            RETURNING *`,
            [data.payroll_period, totalAmount, totalEmployees, PayrollStatus.PENDING]
        );

        const payroll = result.rows[0];

        // Create payroll items for each employee
        // Each item starts with PENDING status and will be processed asynchronously
        const employees = await query(
            `SELECT id, salary FROM employees WHERE is_active = true ${employeeFilter}`,
            queryParams
        );

        for (const employee of employees.rows) {
            await query(
                `INSERT INTO payroll_items (payroll_id, employee_id, amount, status)
                VALUES ($1, $2, $3, $4)`,
                [payroll.id, employee.id, employee.salary, PayrollStatus.PENDING]
            );
        }

        return payroll;
    }

    static async findById(id: number): Promise<Payroll | null> {
        const result = await query('SELECT * FROM payrolls WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    static async findAll(): Promise<Payroll[]> {
        const result = await query(
            'SELECT * FROM payrolls ORDER BY created_at DESC'
        );
        return result.rows;
    }

    static async updateStatus(
        id: number,
        status: PayrollStatus,
        processedCount?: number,
        failedCount?: number
    ): Promise<Payroll> {
        const updates: string[] = ['status = $2', 'updated_at = NOW()'];
        const values: any[] = [id, status];

        // Dynamically add processed_count if provided
        if (processedCount !== undefined) {
            updates.push(`processed_count = $${values.length + 1}`);
            values.push(processedCount);
        }

        // Dynamically add failed_count if provided
        if (failedCount !== undefined) {
            updates.push(`failed_count = $${values.length + 1}`);
            values.push(failedCount);
        }

        // Set processed_at timestamp for terminal states
        if (
            status === PayrollStatus.COMPLETED ||
            status === PayrollStatus.PARTIALLY_COMPLETED
        ) {
            updates.push(`processed_at = NOW()`);
        }

        const result = await query(
            `UPDATE payrolls SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
            values
        );
        return result.rows[0];
    }

}

export class PayrollItemModel {
    // Methods will go here
    static async findByPayrollId(payrollId: number): Promise<PayrollItem[]> {
        const result = await query(
            `SELECT
       pi.id, pi.payroll_id, pi.employee_id, pi.amount, pi.status,
       pi.transaction_reference, pi.error_message, pi.processed_at,
       pi.created_at, pi.updated_at,
       e.name as employee_name, e.employee_id as employee_identifier,
       e.account_number, e.bank_code, e.bank_name
     FROM payroll_items pi
     JOIN employees e ON pi.employee_id = e.id
     WHERE pi.payroll_id = $1
     ORDER BY pi.created_at`,
            [payrollId]
        );
        // Normalize numeric fields from PostgreSQL (which returns them as strings)
        return result.rows.map((row) => ({
            ...row,
            employee_id: parseInt(row.employee_id, 10),
            id: parseInt(row.id, 10),
            payroll_id: parseInt(row.payroll_id, 10),
            amount: parseFloat(row.amount),
        }));
    }

    static async findById(id: number): Promise<PayrollItem | null> {
        const result = await query(
            `SELECT
       pi.id, pi.payroll_id, pi.employee_id, pi.amount, pi.status,
       pi.transaction_reference, pi.error_message, pi.processed_at,
       pi.created_at, pi.updated_at,
       e.name as employee_name, e.employee_id as employee_identifier,
       e.account_number, e.bank_code, e.bank_name
     FROM payroll_items pi
     JOIN employees e ON pi.employee_id = e.id
     WHERE pi.id = $1`,
            [id]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];

        // Convert numeric fields to proper JavaScript numbers for easier calculations and display
        return {
            ...row,
            employee_id: parseInt(row.employee_id, 10),
            id: parseInt(row.id, 10),
            payroll_id: parseInt(row.payroll_id, 10),
            amount: parseFloat(row.amount),
        };
    }

    static async updateStatus(
        id: number,
        status: PayrollStatus,
        transactionReference?: string,
        errorMessage?: string
    ): Promise<PayrollItem> {
        const updates: string[] = ['status = $2', 'updated_at = NOW()'];
        const values: any[] = [id, status];

        // Add transaction reference if provided (from Monnify API response)
        if (transactionReference) {
            updates.push(`transaction_reference = $${values.length + 1}`);
            values.push(transactionReference);
        }

        // Add error message if provided (from failed payment)
        if (errorMessage) {
            updates.push(`error_message = $${values.length + 1}`);
            values.push(errorMessage);
        }

        // Set processed_at timestamp for terminal states
        if (status === PayrollStatus.COMPLETED || status === PayrollStatus.FAILED) {
            updates.push(`processed_at = NOW()`);
        }

        const result = await query(
            `UPDATE payroll_items SET ${updates.join(
                ', '
            )} WHERE id = $1 RETURNING *`,
            values
        );
        return result.rows[0];
    }

}
