import { BaseRepository } from './base.repository.js';
import type { AnalysisRecord, ArtifactRecord } from '../types.js';

export interface IAnalysisRepository {
  findById(id: string, organizationId?: string): Promise<AnalysisRecord | null>;
  findByJobId(jobId: string): Promise<AnalysisRecord | null>;
  listForOrganization(organizationId: string): Promise<AnalysisRecord[]>;
  create(analysis: Omit<AnalysisRecord, 'createdAt' | 'updatedAt'>): Promise<AnalysisRecord>;
  update(id: string, updates: Partial<AnalysisRecord>): Promise<void>;
  createArtifact(artifact: Omit<ArtifactRecord, 'createdAt'>): Promise<ArtifactRecord>;
  getArtifactById(id: string, organizationId?: string): Promise<ArtifactRecord | null>;
  listArtifacts(analysisId: string, organizationId?: string): Promise<ArtifactRecord[]>;
}

export class AnalysisRepository extends BaseRepository implements IAnalysisRepository {
  async findById(id: string, organizationId?: string): Promise<AnalysisRecord | null> {
    return this.db.getAnalysisById(id, organizationId);
  }

  async findByJobId(jobId: string): Promise<AnalysisRecord | null> {
    return this.db.getAnalysisByJobId(jobId);
  }

  async listForOrganization(organizationId: string): Promise<AnalysisRecord[]> {
    return this.db.listAnalysesByOrg(organizationId);
  }

  async create(analysis: Omit<AnalysisRecord, 'createdAt' | 'updatedAt'>): Promise<AnalysisRecord> {
    return this.db.createAnalysis(analysis);
  }

  async update(id: string, updates: Partial<AnalysisRecord>): Promise<void> {
    return this.db.updateAnalysis(id, updates);
  }

  async createArtifact(artifact: Omit<ArtifactRecord, 'createdAt'>): Promise<ArtifactRecord> {
    return this.db.createArtifact(artifact);
  }

  async getArtifactById(id: string, organizationId?: string): Promise<ArtifactRecord | null> {
    return this.db.getArtifactById(id, organizationId);
  }

  async listArtifacts(analysisId: string, organizationId?: string): Promise<ArtifactRecord[]> {
    return this.db.listArtifactsByAnalysis(analysisId, organizationId);
  }
}
