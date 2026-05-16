import { Router } from 'express';
import { PayrollController } from '../controllers/payroll.controller';

const router = Router();

router.post('/', PayrollController.createPayroll);
router.get('/', PayrollController.getAllPayrolls);
router.get('/:id', PayrollController.getPayrollById);
router.post('/:id/process', PayrollController.processPayroll);
router.post('/batch/authorize', PayrollController.authorizeBulkTransfer);
router.get('/:id/status', PayrollController.getPayrollStatus);
router.get(
  '/transaction/:reference/status',
  PayrollController.checkTransactionStatus
);
router.get('/account/balance', PayrollController.getAccountBalance);
router.post('/:id/reconcile', PayrollController.reconcilePayroll);

export default router;
