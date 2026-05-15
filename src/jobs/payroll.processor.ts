import Queue from 'bull';
import { monnifyClient } from '../config/monnify';
import {
    PayrollItemModel,
    PayrollModel,
    PayrollStatus,
} from '../models/payroll';
import { EmployeeModel } from '../models/employee';

export const payrollQueue = new Queue('payroll-processing', {
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
    },
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000
        },
        removeOnComplete: true,
    },
});

payrollQueue.process(async (job) => {
    return processBulkPayroll(job.data.payrollId);
});

async function processBulkPayroll(payrollId: number) {
    const items = await PayrollItemModel.findByPayrollId(payrollId);

    const payable = items.filter(
        (i) =>
            i.status === PayrollStatus.PENDING ||
            (i.status === PayrollStatus.PROCESSING && !i.transaction_reference)
    );

    if (payable.length === 0) return;

    await PayrollModel.updateStatus(payrollId, PayrollStatus.PROCESSING);

    const transfers = [];

    for (const item of payable) {
        const employee = await EmployeeModel.findById(item.employee_id);
        if (!employee) throw new Error('Employee not found');

        const reference = `PAYROLL_${payrollId}_${item.id}`;

        await PayrollItemModel.updateStatus(item.id, PayrollStatus.PROCESSING);

        transfers.push({
            amount: Number(item.amount),
            reference,
            recipientAccountNumber: employee.account_number,
            recipientBankCode: employee.bank_code,
            recipientName: employee.name,
            narration: `Payroll payment`,
        });

    }

    const response = await monnifyClient.initiateBulkTransfer(transfers);

    if (!response?.requestSuccessful) {
        throw new Error('Bulk transfer initiation failed');
    }

    const results = response.responseBody?.transactionList || [];

    for (const item of payable) {
        const ref = `PAYROLL_${payrollId}_${item.id}`;
        const match = results.find((r: any) => r.reference === ref);

        if (match?.transactionReference) {
            await PayrollItemModel.updateStatus(
                item.id,
                PayrollStatus.PROCESSING,
                match.transactionReference
            );
        }

    }

    await updatePayrollStats(payrollId);

}

async function updatePayrollStats(payrollId: number) {
    const items = await PayrollItemModel.findByPayrollId(payrollId);

    const completed = items.filter(
        (i) => i.status === PayrollStatus.COMPLETED
    ).length;

    const failed = items.filter((i) => i.status === PayrollStatus.FAILED).length;

    let status = PayrollStatus.PROCESSING;

    if (completed === items.length) {
        status = PayrollStatus.COMPLETED;
    } else if (failed === items.length) {
        status = PayrollStatus.FAILED;
    } else if (completed > 0) {
        status = PayrollStatus.PARTIALLY_COMPLETED;
    }

    await PayrollModel.updateStatus(payrollId, status, completed, failed);
}

export async function processPayrollItems(payrollId: number) {
  await payrollQueue.add({ payrollId, type: 'bulk' });
}
