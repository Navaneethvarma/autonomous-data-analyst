/**
 * Delivery destination and dispatch payload types.
 */

export type DeliveryDestinationType = 'email' | 'webhook';

export interface DeliveryDestinationRecord {
  id: string;
  organizationId: string;
  name: string;
  destinationType: DeliveryDestinationType;
  recipientEmails?: string | null;
  webhookUrl?: string | null;
  encryptedSecret?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateDeliveryDestinationInput = Omit<DeliveryDestinationRecord, 'createdAt' | 'updatedAt'>;

export interface DeliveryResult {
  ok: boolean;
  destinationType: DeliveryDestinationType;
  destinationId: string;
  deliveredAt: string;
  recipientSummary: string;
  details?: Record<string, unknown>;
  errorMessage?: string;
}

export interface DeliveryPayload {
  deliveryId: string;
  scheduleId: string;
  scheduleRunId: string;
  analysisId: string;
  organizationId: string;
  reportName: string;
  userQuery: string;
  status: string;
  generatedAt: string;
  summaryExplanation?: string;
  artifacts: Array<{
    id: string;
    artifactType: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  }>;
}
