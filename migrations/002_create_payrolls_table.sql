-- Create payrolls table
CREATE TABLE IF NOT EXISTS payrolls (
  id SERIAL PRIMARY KEY,
  payroll_period VARCHAR(100) NOT NULL,
  total_amount DECIMAL(15, 2) NOT NULL,
  total_employees INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  processed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_payrolls_status ON payrolls(status);
CREATE INDEX IF NOT EXISTS idx_payrolls_period ON payrolls(payroll_period);
