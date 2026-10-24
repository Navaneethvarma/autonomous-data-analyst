import type { RouteHandler } from '../types.js';
import { executeAnalyticalQuery } from '../../lib/analytics/duckdb-engine.js';

export const handleDatasetRoutes: RouteHandler = async (ctx) => {
  const { req, pathname, urlObj, services, parseJsonBody, parseBufferBody, getAuthContext, sendJson } = ctx;
  const { storage } = services;

  if (pathname === '/api/datasets/upload' && req.method === 'POST') {
    const auth = await getAuthContext();
    const contentType = req.headers['content-type'] || '';

    let filename = 'dataset.csv';
    let buffer: Buffer;

    if (contentType.includes('application/json')) {
      const body = await parseJsonBody();
      filename = body.filename || 'dataset.csv';
      if (body.contentBase64) {
        buffer = Buffer.from(body.contentBase64, 'base64');
      } else if (body.content) {
        buffer = Buffer.from(body.content, 'utf8');
      } else {
        sendJson(400, { error: 'content or contentBase64 is required' });
        return true;
      }
    } else {
      const queryName = urlObj.searchParams.get('filename');
      filename = queryName || (req.headers['x-filename'] as string) || 'uploaded_data.csv';
      buffer = await parseBufferBody();
    }

    const result = await storage.uploadAndRegisterDataset(auth, {
      originalFilename: filename,
      buffer,
    });

    sendJson(201, {
      dataset: {
        id: result.dataset.id,
        originalFilename: result.dataset.originalFilename,
        fileSizeBytes: result.dataset.fileSizeBytes,
        format: result.dataset.format,
        rowCount: result.dataset.rowCount,
        columnCount: result.dataset.columnCount,
        schemaFingerprint: result.dataset.schemaFingerprint,
        status: result.dataset.status,
        createdAt: result.dataset.createdAt,
      },
      profile: result.profile,
    });
    return true;
  }

  if (pathname === '/api/datasets' && req.method === 'GET') {
    const auth = await getAuthContext();
    const datasets = await storage.listDatasets(auth);
    sendJson(
      200,
      datasets.map(d => ({
        id: d.id,
        originalFilename: d.originalFilename,
        fileSizeBytes: d.fileSizeBytes,
        format: d.format,
        rowCount: d.rowCount,
        columnCount: d.columnCount,
        schemaFingerprint: d.schemaFingerprint,
        status: d.status,
        createdAt: d.createdAt,
      }))
    );
    return true;
  }

  const datasetMatch = pathname.match(/^\/api\/datasets\/([a-zA-Z0-9_\-]+)(?:\/([a-zA-Z0-9_\-]+))?$/);
  if (datasetMatch && datasetMatch[1]) {
    const datasetId = datasetMatch[1];
    const subResource = datasetMatch[2];
    const auth = await getAuthContext();

    if (!subResource && req.method === 'GET') {
      const dataset = await storage.getDataset(auth, datasetId);
      sendJson(200, {
        id: dataset.id,
        originalFilename: dataset.originalFilename,
        fileSizeBytes: dataset.fileSizeBytes,
        format: dataset.format,
        rowCount: dataset.rowCount,
        columnCount: dataset.columnCount,
        schemaFingerprint: dataset.schemaFingerprint,
        status: dataset.status,
        createdAt: dataset.createdAt,
      });
      return true;
    }

    if (subResource === 'profile' && req.method === 'GET') {
      const profile = await storage.getDatasetProfile(auth, datasetId);
      if (!profile) {
        sendJson(404, { error: 'Dataset profile not found' });
        return true;
      }
      sendJson(200, profile);
      return true;
    }

    if (subResource === 'preview' && req.method === 'GET') {
      const dataset = await storage.getDataset(auth, datasetId);
      const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '50', 10), 100);
      const queryRes = await executeAnalyticalQuery(
        {
          datasetPath: dataset.storagePath,
          sql: `SELECT * FROM dataset LIMIT ${limit}`,
        },
        { customBaseDir: storage.getBaseDir() }
      );
      sendJson(200, {
        rows: queryRes.rows,
        rowCount: queryRes.rowCount,
        columns: queryRes.columns,
      });
      return true;
    }

    if (!subResource && req.method === 'DELETE') {
      await storage.deleteDataset(auth, datasetId);
      sendJson(200, { message: 'Dataset deleted successfully' });
      return true;
    }
  }

  return false;
};
