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
    if (!setting) {
      res.json({ success: true, data: null });
      return;
    }
    // Mask secret values: show first 4 + last 4 chars only
    const maskedValue =
      setting.isSecret && setting.value.length > 8
        ? `${setting.value.slice(0, 4)}${'*'.repeat(setting.value.length - 8)}${setting.value.slice(-4)}`
        : setting.isSecret
          ? '****'
          : setting.value;
    res.json({
      success: true,
      data: { key: setting.key, value: maskedValue, isSecret: setting.isSecret },
    });
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

export async function upsertSetting(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { key, value, isSecret } = req.body;
    if (!key || typeof key !== 'string') {
      res.status(400).json({ success: false, data: null, message: 'Missing required field: key' });
      return;
    }
    if (value === undefined || value === null) {
      res
        .status(400)
        .json({ success: false, data: null, message: 'Missing required field: value' });
      return;
    }
    const setting = await adminService.updateSetting(key, String(value), isSecret ?? false);
    res.json({
      success: true,
      data: { key: setting.key, value: setting.value, isSecret: setting.isSecret },
    });
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

// --- Google OAuth ---

export async function getGoogleOAuthConfig(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const setting = await adminService.getSetting('google-oauth');
    if (!setting) {
      res.json({ success: true, data: null });
      return;
    }
    const config = JSON.parse(setting.value);
    res.json({
      success: true,
      data: {
        clientId: config.clientId ?? '',
        maskedSecret: config.clientSecret ? `****${config.clientSecret.slice(-4)}` : '',
        redirectUriDev: config.redirectUriDev ?? '',
        redirectUriProd: config.redirectUriProd ?? '',
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateGoogleOAuthConfig(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { clientId, clientSecret, redirectUriDev, redirectUriProd } = req.body;

    const existing = await adminService.getSetting('google-oauth');
    let existingConfig = {
      clientId: '',
      clientSecret: '',
      redirectUriDev: '',
      redirectUriProd: '',
    };
    if (existing) {
      existingConfig = { ...existingConfig, ...JSON.parse(existing.value) };
    }

    const config = {
      clientId: clientId ?? existingConfig.clientId,
      clientSecret: clientSecret || existingConfig.clientSecret,
      redirectUriDev: redirectUriDev ?? existingConfig.redirectUriDev,
      redirectUriProd: redirectUriProd ?? existingConfig.redirectUriProd,
    };

    await adminService.updateSetting('google-oauth', JSON.stringify(config), true);
    res.json({ success: true, data: null, message: 'Google OAuth config saved' });
  } catch (err) {
    next(err);
  }
}

export async function testGoogleOAuthConnection(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const setting = await adminService.getSetting('google-oauth');
    if (!setting) {
      res.status(400).json({ success: false, data: null, message: 'Google OAuth not configured' });
      return;
    }

    const config = JSON.parse(setting.value);
    if (!config.clientId || !config.clientSecret) {
      res.status(400).json({
        success: false,
        data: null,
        message: 'Missing Client ID or Client Secret',
      });
      return;
    }

    // Validate by attempting a token exchange with a dummy code.
    // Google returns "invalid_grant" for valid credentials + bad code,
    // vs "invalid_client" for bad credentials.
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: 'test_validation_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUriDev || config.redirectUriProd || 'http://localhost',
        grant_type: 'authorization_code',
      }).toString(),
    });

    const data = (await response.json()) as { error?: string; error_description?: string };

    if (data.error === 'invalid_grant' || data.error === 'redirect_uri_mismatch') {
      // These errors mean the credentials are valid — the code/redirect is just wrong (expected)
      res.json({
        success: true,
        data: null,
        message: `Google OAuth credentials verified. Client ID: ${config.clientId.slice(0, 20)}...`,
      });
    } else if (data.error === 'invalid_client') {
      res.status(400).json({
        success: false,
        data: null,
        message: 'Invalid Client ID or Client Secret. Check your Google Cloud Console.',
      });
    } else {
      res.status(400).json({
        success: false,
        data: null,
        message: `Unexpected response: ${data.error_description || data.error || 'Unknown error'}`,
      });
    }
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
      res.status(400).json({
        success: false,
        data: null,
        message: 'Missing cloud name, API key, or API secret',
      });
      return;
    }

    // Test by calling Cloudinary ping endpoint
    const credentials = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64');
    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/ping`, {
      headers: { Authorization: `Basic ${credentials}` },
    });

    if (response.ok) {
      res.json({
        success: true,
        data: null,
        message: `Connected to Cloudinary (${config.cloudName}). Upload folder: ${config.uploadFolder}/`,
      });
    } else {
      const errBody = (await response
        .json()
        .catch(() => ({ error: { message: 'Unknown error' } }))) as {
        error?: { message?: string };
      };
      res.status(400).json({
        success: false,
        data: null,
        message: `Cloudinary error: ${errBody.error?.message ?? response.statusText}`,
      });
    }
  } catch (err) {
    next(err);
  }
}

// --- SMTP Email ---

export async function getSmtpConfig(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const setting = await adminService.getSetting('smtp');
    if (!setting) {
      res.json({ success: true, data: null });
      return;
    }
    const config = JSON.parse(setting.value);
    const apiKey = config.apiKey || '';
    res.json({
      success: true,
      data: {
        maskedApiKey: apiKey ? `${apiKey.slice(0, 5)}****${apiKey.slice(-4)}` : '',
        fromAddress: config.fromAddress ?? '',
        fromName: config.fromName ?? '',
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateSmtpConfig(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { apiKey, fromAddress, fromName } = req.body;

    const existing = await adminService.getSetting('smtp');
    let existingConfig = {
      apiKey: '',
      fromAddress: '',
      fromName: 'Spresso',
    };
    if (existing) {
      existingConfig = { ...existingConfig, ...JSON.parse(existing.value) };
    }

    const config = {
      apiKey: apiKey || existingConfig.apiKey,
      fromAddress: fromAddress ?? existingConfig.fromAddress,
      fromName: fromName ?? existingConfig.fromName,
    };

    await adminService.updateSetting('smtp', JSON.stringify(config), true);

    // Invalidate cached email config
    const { invalidateEmailConfig } = await import('../services/email.service.js');
    invalidateEmailConfig();

    res.json({ success: true, data: null, message: 'Email config saved' });
  } catch (err) {
    next(err);
  }
}

export async function testSmtpConnection(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { sendTestEmail } = await import('../services/email.service.js');
    const userEmail = req.user.email;
    await sendTestEmail(userEmail);
    res.json({ success: true, data: null, message: `Test email sent to ${userEmail}` });
  } catch (err) {
    next(err);
  }
}

// --- Turnstile Bot Protection ---

export async function getTurnstileConfig(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const setting = await adminService.getSetting('turnstile');
    if (!setting) {
      res.json({ success: true, data: null });
      return;
    }
    const config = JSON.parse(setting.value);
    res.json({
      success: true,
      data: {
        siteKey: config.siteKey ?? '',
        maskedSecret: config.secretKey ? `****${config.secretKey.slice(-4)}` : '',
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateTurnstileConfig(
  req: Request,
  res: Response<ApiResponse<unknown>>,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { siteKey, secretKey } = req.body;

    const existing = await adminService.getSetting('turnstile');
    let existingConfig = { siteKey: '', secretKey: '' };
    if (existing) {
      existingConfig = { ...existingConfig, ...JSON.parse(existing.value) };
    }

    const config = {
      siteKey: siteKey ?? existingConfig.siteKey,
      secretKey: secretKey || existingConfig.secretKey,
    };

    await adminService.updateSetting('turnstile', JSON.stringify(config), true);
    res.json({ success: true, data: null, message: 'Turnstile config saved' });
  } catch (err) {
    next(err);
  }
}
