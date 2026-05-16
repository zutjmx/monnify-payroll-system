import { Request, Response } from 'express';
import { EmployeeModel, CreateEmployeeInput } from '../models/employee';

export class EmployeeController {
    // Controller methods will go here
    static async createEmployee(req: Request, res: Response): Promise<void> {
        try {
            const data: CreateEmployeeInput = req.body;

            if (
                !data.name ||
                !data.email ||
                !data.salary ||
                !data.account_number ||
                !data.bank_code
            ) {
                res.status(400).json({
                    error:
                        'Missing required fields: name, email, salary, account_number, bank_code',
                });
                return;
            }

            const employee = await EmployeeModel.create(data);
            res.status(201).json({
                message: 'Employee created successfully',
                data: employee,
            });
        } catch (error: any) {
            console.error('Error creating employee:', error);
            res
                .status(500)
                .json({ error: error.message || 'Failed to create employee' });
        }

    }

    static async getAllEmployees(req: Request, res: Response): Promise<void> {
        try {
            const employees = await EmployeeModel.findAll();
            res.json({ data: employees });
        } catch (error: any) {
            console.error('Error fetching employees:', error);
            res
                .status(500)
                .json({ error: error.message || 'Failed to fetch employees' });
        }
    }

    static async getEmployeeById(req: Request, res: Response): Promise<void> {
        try {
            const rawId = req.params.id;
            const id = Array.isArray(rawId) ? rawId[0] : rawId;
            if (!id) {
                res.status(400).json({ error: 'Missing employee id' });
                return;
            }
            const employee = await EmployeeModel.findById(parseInt(id));

            if (!employee) {
                res.status(404).json({ error: 'Employee not found' });
                return;
            }

            res.json({ data: employee });
        } catch (error: any) {
            console.error('Error fetching employee:', error);
            res
                .status(500)
                .json({ error: error.message || 'Failed to fetch employee' });
        }
    }

    static async updateEmployee(req: Request, res: Response): Promise<void> {
        try {
            const rawId = req.params.id;
            const id = Array.isArray(rawId) ? rawId[0] : rawId;
            if (!id) {
                res.status(400).json({ error: 'Missing employee id' });
                return;
            }
            const data: Partial<CreateEmployeeInput> = req.body;

            const employee = await EmployeeModel.findById(parseInt(id));
            if (!employee) {
                res.status(404).json({ error: 'Employee not found' });
                return;
            }

            const updated = await EmployeeModel.update(parseInt(id), data);
            res.json({
                message: 'Employee updated successfully',
                data: updated,
            });
        } catch (error: any) {
            console.error('Error updating employee:', error);
            res
                .status(500)
                .json({ error: error.message || 'Failed to update employee' });
        }
    }

    static async deleteEmployee(req: Request, res: Response): Promise<void> {
        try {
            const rawId = req.params.id;
            const id = Array.isArray(rawId) ? rawId[0] : rawId;
            if (!id) {
                res.status(400).json({ error: 'Missing employee id' });
                return;
            }

            const employee = await EmployeeModel.findById(parseInt(id));
            if (!employee) {
                res.status(404).json({ error: 'Employee not found' });
                return;
            }

            await EmployeeModel.delete(parseInt(id));
            res.json({ message: 'Employee deleted successfully' });
        } catch (error: any) {
            console.error('Error deleting employee:', error);
            res
                .status(500)
                .json({ error: error.message || 'Failed to delete employee' });
        }
    }
}
