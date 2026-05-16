import { Request, Response } from 'express';
import {
    PayrollModel,
    PayrollItemModel,
    PayrollStatus,
} from '../models/payroll';
import { processPayrollItems } from '../jobs/payroll.processor';
import { monnifyClient } from '../config/monnify';

export class PayrollController {

    static async createPayroll(req: Request, res: Response): Promise<void> {
        try {
            const { payroll_period, employee_ids } = req.body;

            if (!payroll_period) {
                res.status(400).json({ error: 'payroll_period is required' });
                return;
            }

            const processedEmployeeIds = employee_ids
                ? employee_ids
                    .map((id: any) => parseInt(id, 10))
                    .filter((id: number) => !isNaN(id))
                : undefined;

            const payroll = await PayrollModel.create({
                payroll_period,
                employee_ids: processedEmployeeIds,
            });

            res.status(201).json({
                message: 'Payroll created successfully',
                data: payroll,
            });
        } catch (error: any) {
            console.error('Error creating payroll:', error);
            res
                .status(500)
                .json({ error: error.message || 'Failed to create payroll' });
        }

    }

    static async getAllPayrolls(req: Request, res: Response): Promise<void> {
        try {
            const payrolls = await PayrollModel.findAll();
            res.json({ data: payrolls });
        } catch (error: any) {
            console.error('Error fetching payrolls:', error);
            res
                .status(500)
                .json({ error: error.message || 'Failed to fetch payrolls' });
        }
    }

    static async getPayrollById(req: Request, res: Response): Promise<void> {
        try {
            const rawId = req.params.id;
            const id = Array.isArray(rawId) ? rawId[0] : rawId;
            if (!id) {
                res.status(400).json({ error: 'Missing id' });
                return;
            }

            const payroll = await PayrollModel.findById(parseInt(id));

            if (!payroll) {
                res.status(404).json({ error: 'Payroll not found' });
                return;
            }

            const items = await PayrollItemModel.findByPayrollId(payroll.id);

            res.json({
                data: {
                    ...payroll,
                    items,
                },
            });
        } catch (error: any) {
            console.error('Error fetching payroll:', error);
            res
                .status(500)
                .json({ error: error.message || 'Failed to fetch payroll' });
        }
    }

    static async processPayroll(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;

            const payroll = await PayrollModel.findById(Number(id));

            if (!payroll) {
                res.status(404).json({ error: 'Payroll not found' });
                return;
            }

            if (
                payroll.status === PayrollStatus.COMPLETED ||
                payroll.status === PayrollStatus.PROCESSING
            ) {
                res.status(400).json({
                    error: `Payroll already ${payroll.status}`,
                });
                return;
            }

            // Queue the payroll for processing
            await processPayrollItems(payroll.id);

            res.json({
                message: 'Payroll queued for bulk processing',
                data: {
                    payroll_id: payroll.id,
                    processing_mode: 'bulk',
                },
            });
        } catch (error: any) {
            console.error('Error processing payroll:', error);
            res.status(500).json({
                error: error.message || 'Failed to process payroll',
            });
        }
    }

    static async reconcilePayroll(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;

            const payroll = await PayrollModel.findById(Number(id));
            if (!payroll) {
                res.status(404).json({ error: 'Payroll not found' });
                return;
            }

            const items = await PayrollItemModel.findByPayrollId(Number(id));

            const itemsToReconcile = items.filter(
                (item) => item.transaction_reference
            );

            if (itemsToReconcile.length === 0) {
                res.json({
                    message: 'No items to reconcile (no transaction references found)',
                    reconciled: 0,
                });
                return;
            }

            let updated = 0;
            let errors = 0;

            for (const item of itemsToReconcile) {
                try {
                    const txStatus = await monnifyClient.getTransactionStatus(
                        item.transaction_reference!
                    );

                    const responseBody = txStatus.responseBody || txStatus;
                    const paymentStatus =
                        responseBody.paymentStatus || responseBody.status;

                    if (
                        paymentStatus === 'PAID' &&
                        item.status !== PayrollStatus.COMPLETED
                    ) {
                        await PayrollItemModel.updateStatus(
                            item.id,
                            PayrollStatus.COMPLETED,
                            item.transaction_reference
                        );
                        updated++;
                    } else if (
                        paymentStatus === 'FAILED' &&
                        item.status !== PayrollStatus.FAILED
                    ) {
                        const errorMessage =
                            responseBody.paymentDescription ||
                            responseBody.failureReason ||
                            'Transaction failed';
                        await PayrollItemModel.updateStatus(
                            item.id,
                            PayrollStatus.FAILED,
                            item.transaction_reference,
                            errorMessage
                        );
                        updated++;
                    }
                } catch (error: any) {
                    errors++;
                    console.error(`Error reconciling item ${item.id}:`, error.message);
                }
            }

            // Update payroll stats
            await PayrollController.updatePayrollStats(Number(id));

            res.json({
                message: 'Payroll reconciled successfully',
                reconciled: updated,
                errors,
                total: itemsToReconcile.length,
            });
        } catch (error: any) {
            console.error('Error reconciling payroll:', error);
            res.status(500).json({
                error: error.message || 'Failed to reconcile payroll',
            });
        }
    }

    private static async updatePayrollStats(payrollId: number): Promise<void> {
        const items = await PayrollItemModel.findByPayrollId(payrollId);

        const completed = items.filter(
            (i) => i.status === PayrollStatus.COMPLETED
        ).length;
        const failed = items.filter(
            (i) => i.status === PayrollStatus.FAILED
        ).length;
        const total = items.length;

        let status: PayrollStatus;
        if (completed === total) {
            status = PayrollStatus.COMPLETED;
        } else if (failed === total) {
            status = PayrollStatus.FAILED;
        } else if (completed > 0) {
            status = PayrollStatus.PARTIALLY_COMPLETED;
        } else {
            status = PayrollStatus.PROCESSING;
        }

        await PayrollModel.updateStatus(payrollId, status, completed, failed);

    }

    static async getPayrollStatus(req: Request, res: Response): Promise<void> {
        try {
            const rawId = req.params.id;
            const id = Array.isArray(rawId) ? rawId[0] : rawId;
            if (!id) {
                res.status(400).json({ error: 'Missing id' });
                return;
            }

            const payroll = await PayrollModel.findById(parseInt(id));

            if (!payroll) {
                res.status(404).json({ error: 'Payroll not found' });
                return;
            }

            const items = await PayrollItemModel.findByPayrollId(payroll.id);

            res.json({
                data: {
                    ...payroll,
                    items,
                    summary: {
                        total: items.length,
                        completed: items.filter((i) => i.status === PayrollStatus.COMPLETED)
                            .length,
                        failed: items.filter((i) => i.status === PayrollStatus.FAILED)
                            .length,
                        pending: items.filter((i) => i.status === PayrollStatus.PENDING)
                            .length,
                        processing: items.filter(
                            (i) => i.status === PayrollStatus.PROCESSING
                        ).length,
                    },
                },
            });
        } catch (error: any) {
            console.error('Error fetching payroll status:', error);
            res
                .status(500)
                .json({ error: error.message || 'Failed to fetch payroll status' });
        }
    }

    static async authorizeBulkTransfer(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            const { reference, authorizationCode, payrollId } = req.body;

            if (!reference) {
                res.status(400).json({ error: 'Batch reference is required' });
                return;
            }

            if (!authorizationCode) {
                res.status(400).json({ error: 'Authorization code (OTP) is required' });
                return;
            }

            const result = await monnifyClient.authorizeBulkTransfer(
                reference,
                authorizationCode
            );

            res.json({
                message: 'Bulk transfer authorized successfully',
                data: result,
            });
        } catch (error: any) {
            console.error('Error authorizing bulk transfer:', error);
            res.status(500).json({
                error: error.message || 'Failed to authorize bulk transfer',
            });
        }
    }

    static async checkTransactionStatus(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            //const { reference } = req.params;

            const rawReference = req.params.reference;
            const reference = Array.isArray(rawReference) ? rawReference[0] : rawReference;

            if (!reference) {
                res.status(400).json({ error: 'Transaction reference is required' });
                return;
            }

            const status = await monnifyClient.getTransactionStatus(reference);
            res.json({ data: status });
        } catch (error: any) {
            console.error('Error checking transaction status:', error);
            res
                .status(500)
                .json({ error: error.message || 'Failed to check transaction status' });
        }
    }

    static async getAccountBalance(req: Request, res: Response): Promise<void> {
        try {
            const balance = await monnifyClient.getAccountBalance();
            res.json({ data: balance });
        } catch (error: any) {
            console.error('Error fetching account balance:', error);
            res
                .status(500)
                .json({ error: error.message || 'Failed to fetch account balance' });
        }
    }

}