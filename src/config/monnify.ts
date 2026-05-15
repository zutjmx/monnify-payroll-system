import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export interface MonnifyConfig {
    apiKey: string;
    secretKey: string;
    baseUrl: string;
    contractCode: string;
}

export class MonnifyClient {
    private readonly apiKey: string;
    private readonly secretKey: string;
    private baseUrl: string;
    private contractCode: string;
    private client: AxiosInstance;

    private accessToken: string | null = null;
    private tokenExpiry: number = 0;

    constructor() {
        this.apiKey = process.env.MONNIFY_API_KEY || '';
        this.secretKey = process.env.MONNIFY_SECRET_KEY || '';
        this.baseUrl = process.env.MONNIFY_BASE_URL || 'https://api.monnify.com';
        this.contractCode = process.env.MONNIFY_CONTRACT_CODE || '';

        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        this.client.interceptors.request.use(async (config: any) => {
            // Skip auth for the login endpoint itself
            if (config.url?.includes('/auth/login')) {
                return config;
            }

            // Ensure a valid token exists before every request
            await this.ensureAuthenticated();

            if (this.accessToken) {
                config.headers.Authorization = `Bearer ${this.accessToken}`;
            }

            return config;
        });

    }

    private async authenticate(): Promise<void> {
        try {
            // Encode credentials as Base64 for Basic Auth
            const credentials = Buffer.from(
                `${this.apiKey}:${this.secretKey}`
            ).toString('base64');

            const response = await axios.post(
                `${this.baseUrl}/api/v1/auth/login`,
                {},
                {
                    headers: {
                        Authorization: `Basic ${credentials}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            this.accessToken = response.data.responseBody.accessToken;
            // Set expiry to 23 hours (Monnify tokens typically last 24 hours)
            // This prevents edge cases where token expires mid-request
            this.tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
        } catch (error: any) {
            console.error(
                'Monnify authentication error:',
                error.response?.data || error.message
            );
            throw new Error('Failed to authenticate with Monnify');
        }
    }

    private async ensureAuthenticated(): Promise<void> {
        if (!this.accessToken || Date.now() >= this.tokenExpiry) {
            await this.authenticate();
        }
    }

    async initiateBulkTransfer(
        transfers: Array<{
            amount: number;
            recipientAccountNumber: string;
            recipientBankCode: string;
            recipientName: string;
            narration: string;
            reference: string;
        }>
    ): Promise<any> {
        await this.ensureAuthenticated();

        if (!transfers || transfers.length === 0) {
            throw new Error('No transfers provided');
        }

        if (!this.contractCode) {
            throw new Error('Monnify contract code is not configured');
        }

        for (const transfer of transfers) {
            if (!transfer.amount || transfer.amount <= 0) {
                throw new Error(`Invalid amount for transfer: ${transfer.reference}`);
            }
            if (!transfer.recipientAccountNumber) {
                throw new Error(`Missing account number for transfer: ${transfer.reference}`);
            }
            if (!transfer.recipientBankCode) {
                throw new Error(`Missing bank code for transfer: ${transfer.reference}`);
            }
        }

        const requestBody = {
            title: 'Bulk Payroll Transfers',
            batchReference: `BATCH_${Date.now()}`,
            narration: 'Payroll batch disbursement',
            sourceAccountNumber: this.contractCode,
            onValidationFailure: 'CONTINUE',
            notificationInterval: 50,
            transactionList: transfers.map((t) => ({
                amount: t.amount,
                reference: t.reference,
                narration: t.narration,
                destinationBankCode: t.recipientBankCode,
                destinationAccountNumber: t.recipientAccountNumber,
                currency: 'NGN',
            })),
        };

        try {
            const response = await this.client.post(
                '/api/v2/disbursements/batch',
                requestBody
            );
            return response.data;
        } catch (error: any) {
            const errorData = error.response?.data;
            const message =
                errorData?.responseMessage ||
                errorData?.message ||
                `Monnify API error (${error.response?.status})`;
            throw new Error(message);
        }
    }

    async authorizeBulkTransfer(
        reference: string,
        authorizationCode: string
    ): Promise<any> {
        await this.ensureAuthenticated();
        if (!reference) {
            throw new Error('Batch reference is required');
        }

        if (!authorizationCode) {
            throw new Error('Authorization code (OTP) is required');
        }

        const requestBody = {
            reference,
            authorizationCode,
        };

        try {
            const response = await this.client.post(
                '/api/v2/disbursements/batch/validate-otp',
                requestBody
            );

            return response.data;
        } catch (error: any) {
            const errorDetails = error.response?.data || error.message;
            console.error(
                'Monnify authorization error:',
                JSON.stringify(errorDetails, null, 2)
            );

            if (error.response) {
                const errorData = error.response.data;
                const errorMessage =
                    errorData?.responseMessage ||
                    errorData?.message ||
                    `Monnify API error (${error.response.status})`;
                throw new Error(errorMessage);
            }
            throw error;
        }
    }

    async getTransactionStatus(transactionReference: string): Promise<any> {
        await this.ensureAuthenticated();
        try {
            const response = await this.client.get(
                `/api/v2/disbursements/${transactionReference}/status`
            );
            return response.data;
        } catch (error: any) {
            console.error(
                'Monnify status check error:',
                error.response?.data || error.message
            );
            throw error;
        }
    }

    async getBatchDetails(batchReference: string): Promise<any> {
        await this.ensureAuthenticated();
        if (!batchReference) {
            throw new Error('Batch reference is required');
        }

        try {
            const response = await this.client.get(
                `/api/v2/disbursements/batch/${batchReference}`
            );
            return response.data;
        } catch (error: any) {
            console.error(
                'Monnify batch details error:',
                error.response?.data || error.message
            );
            throw error;
        }
    }

    async getAccountBalance(): Promise<any> {
        await this.ensureAuthenticated();

        try {
            const response = await this.client.get(
                `/api/v2/disbursements/wallet-balance?accountNumber=${this.contractCode}`
            );
            return response.data;
        } catch (error: any) {
            console.error(
                'Monnify balance check error:',
                error.response?.data || error.message
            );
            throw error;
        }
    }

}

export const monnifyClient = new MonnifyClient();
