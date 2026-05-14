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

}