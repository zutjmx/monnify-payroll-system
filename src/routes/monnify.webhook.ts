import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
    PayrollItemModel,
    PayrollModel,
    PayrollStatus,
} from '../models/payroll';

const router = Router();

function verifySignature(req: Request): boolean {
    const signature = req.headers['monnify-signature'] as string;
    if (!signature) return false;

    const secret = process.env.MONNIFY_WEBHOOK_SECRET!;
    const hash = crypto
        .createHmac('sha512', secret)
        .update(JSON.stringify(req.body))
        .digest('hex');

    return hash === signature;
}

router.post('/monnify/webhook', async (req: Request, res: Response) => {
    try {
        console.log('Monnify Webhook:', JSON.stringify(req.body, null, 2));

        const { eventType, eventData } = req.body;

        if (!eventData?.reference) {
            console.warn('Missing reference, ignoring webhook');
            return res.status(200).send('Ignored');
        }

        const paymentReference = eventData.reference;
        const transactionReference = eventData.transactionReference;
        const description = eventData.transactionDescription || '';

        // Parse our reference format: PAYROLL_{payrollId}_{itemId}
        const [prefix, payrollIdStr, itemIdStr] = paymentReference.split('_');

        if (prefix !== 'PAYROLL') {
            console.warn('Invalid payment reference format:', paymentReference);
            return res.status(200).send('Ignored');
        }

        const payrollId = Number(payrollIdStr);
        const itemId = Number(itemIdStr);

        if (isNaN(payrollId) || isNaN(itemId)) {
            console.warn('Invalid payroll/item IDs:', paymentReference);
            return res.status(200).send('Ignored');
        }

        const item = await PayrollItemModel.findById(itemId);

        if (!item) {
            console.warn('Payroll item not found:', itemId);
            return res.status(200).send('Ignored');
        }

        // Idempotency check - don't process already finalized items
        if (
            item.status === PayrollStatus.COMPLETED ||
            item.status === PayrollStatus.FAILED
        ) {
            console.log(`Item ${itemId} already finalized (${item.status})`);
            return res.status(200).send('Already processed');
        }

        // Update status based on event type
        if (
            eventType === 'SUCCESSFUL_DISBURSEMENT' ||
            eventData.status === 'SUCCESS'
        ) {
            await PayrollItemModel.updateStatus(
                itemId,
                PayrollStatus.COMPLETED,
                transactionReference
            );
            console.log(`✅ Payroll item ${itemId} COMPLETED`);
        } else if (
            eventType === 'FAILED_DISBURSEMENT' ||
            eventType === 'REVERSED_DISBURSEMENT' ||
            eventData.status === 'FAILED'
        ) {
            await PayrollItemModel.updateStatus(
                itemId,
                PayrollStatus.FAILED,
                transactionReference,
                description
            );
            console.log(`Payroll item ${itemId} FAILED`);
        } else {
            console.log(`Unhandled Monnify eventType: ${eventType}`);
        }

        // Update overall payroll stats
        await updatePayrollStats(payrollId);

        return res.status(200).send('OK');

    } catch (error: any) {
        console.error('Monnify webhook error:', error.message);
        return res.status(200).send('OK'); // Always return 200 to prevent retries
    }
});

export default router;

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
