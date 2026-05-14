-- Create payroll_items table
CREATE TABLE IF NOT EXISTS payroll_items (
  id SERIAL PRIMARY KEY,
  payroll_id INTEGER NOT NULL REFERENCES payrolls(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  amount DECIMAL(15, 2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  transaction_reference VARCHAR(255),
  error_message TEXT,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_payroll_items_payroll_id ON payroll_items(payroll_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee_id ON payroll_items(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_status ON payroll_items(status);
CREATE INDEX IF NOT EXISTS idx_payroll_items_transaction_ref ON payroll_items(transaction_reference);
