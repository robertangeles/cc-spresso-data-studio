import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse, DatabaseStatus, TableInfo, QueryResult } from '@cc/shared';
import { UnauthorizedError } from '../utils/errors.js';
import * as adminService from '../services/admin.service.js';
import { providerRegistry } from '../services/ai/provider.registry.js';

export async function getDatabaseStatus(
  req: Request,
  res: Response<ApiResponse<DatabaseStatus>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const status = await adminService.getDatabaseStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
}

export async function getTableInfo(
  req: Request,
  res: Response<ApiResponse<TableInfo[]>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const tables = await adminService.getTableInfo();
    res.json({ success: true, data: tables });
  } catch (err) {
    next(err);
  }
}

export async function executeQuery(
  req: Request,
  res: Response<ApiResponse<QueryResult>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { sql, mode } = req.body;
    const result = await adminService.executeQuery(sql, mode, req.user.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getDatabaseUrl(
  req: Request,
  res: Response<ApiResponse<{ raw: string; masked: string }>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const url = adminService.getDatabaseUrl();
    res.json({ success: true, data: url });
  } catch (err) {
    next(err);
  }
}

export async function getSetting(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const setting = await adminService.getSetting(req.params.key);
    res.json({ success: true, data: setting });
  } catch (err) {
    next(err);
  }
}

export async function updateSetting(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { value, isSecret } = req.body;
    const setting = await adminService.updateSetting(req.params.key, value, isSecret);
    res.json({ success: true, data: setting });
  } catch (err) {
    next(err);
  }
}

export async function getAIProviders(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const providers = await adminService.getAIProviders();
    res.json({ success: true, data: providers });
  } catch (err) {
    next(err);
  }
}

export async function getAIProviderKey(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const key = await adminService.getAIProviderRawKey(req.params.id);
    res.json({ success: true, data: { apiKey: key } });
  } catch (err) {
    next(err);
  }
}

export async function updateAIProviderKey(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { apiKey } = req.body;
    await adminService.updateAIProviderKey(req.params.id, apiKey ?? '');
    // Reload provider registry so new keys take effect immediately
    await providerRegistry.loadFromDatabase();
    res.json({ success: true, data: null, message: 'API key updated' });
  } catch (err) {
    next(err);
  }
}

export async function getConfiguredModels(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const models = await adminService.getConfiguredModels();
    res.json({ success: true, data: models });
  } catch (err) {
    next(err);
  }
}

// --- Site Settings ---

export async function getSiteSettings(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const setting = await adminService.getSetting('site');
    if (!setting) {
      res.json({ success: true, data: { sessionDuration: '4h' } });
      return;
    }
    res.json({ success: true, data: JSON.parse(setting.value) });
  } catch (err) {
    next(err);
  }
}

export async function updateSiteSettings(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    await adminService.updateSetting('site', JSON.stringify(req.body), false);
    res.json({ success: true, data: null, message: 'Site settings saved' });
  } catch (err) {
    next(err);
  }
}

// --- Cloudinary ---

export async function getCloudinaryConfig(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const setting = await adminService.getSetting('cloudinary');
    if (!setting) {
      res.json({ success: true, data: null });
      return;
    }
    const config = JSON.parse(setting.value);
    res.json({
      success: true,
      data: {
        cloudName: config.cloudName ?? '',
        apiKey: config.apiKey ?? '',
        maskedSecret: config.apiSecret ? `****${config.apiSecret.slice(-4)}` : '',
        uploadFolder: config.uploadFolder ?? 'draftpunk',
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateCloudinaryConfig(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { cloudName, apiKey, apiSecret, uploadFolder } = req.body;

    // Preserve existing secret if not provided
    const existing = await adminService.getSetting('cloudinary');
    let existingSecret = '';
    if (existing) {
      const parsed = JSON.parse(existing.value);
      existingSecret = parsed.apiSecret ?? '';
    }

    const config = {
      cloudName: cloudName ?? '',
      apiKey: apiKey ?? '',
      apiSecret: apiSecret || existingSecret,
      uploadFolder: uploadFolder ?? 'draftpunk',
    };

    await adminService.updateSetting('cloudinary', JSON.stringify(config), true);
    res.json({ success: true, data: null, message: 'Cloudinary config saved' });
  } catch (err) {
    next(err);
  }
}

export async function testCloudinaryConnection(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const setting = await adminService.getSetting('cloudinary');
    if (!setting) {
      res.status(400).json({ success: false, data: null, message: 'Cloudinary not configured' });
      return;
    }

    const config = JSON.parse(setting.value);
    if (!config.cloudName || !config.apiKey || !config.apiSecret) {
      res.status(400).json({ success: false, data: null, message: 'Missing cloud name, API key, or API secret' });
      return;
    }

    // Test by calling Cloudinary ping endpoint
    const credentials = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64');
    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/ping`, {
      headers: { Authorization: `Basic ${credentials}` },
    });

    if (response.ok) {
      res.json({ success: true, data: null, message: `Connected to Cloudinary (${config.cloudName}). Upload folder: ${config.uploadFolder}/` });
    } else {
      const errBody = await response.json().catch(() => ({ error: { message: 'Unknown error' } })) as { error?: { message?: string } };
      res.status(400).json({ success: false, data: null, message: `Cloudinary error: ${errBody.error?.message ?? response.statusText}` });
    }
  } catch (err) {
    next(err);
  }
}
