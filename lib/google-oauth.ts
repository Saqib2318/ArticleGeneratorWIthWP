import { google } from 'googleapis';
import  Prisma  from '@/lib/prisma';

/**
 * Scopes:
 * - spreadsheets / documents: read+write content
 * - drive.readonly: list user's sheets & docs (picker dropdown)
 * - userinfo.email: show who connected
 */
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing in .env');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGoogleAuthUrl(state: string) {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}
async function getTokenWithRetry(client: any, code: string, tries = 3) {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      return await client.getToken(code);
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);
      // sirf network / premature close pe retry
      if (
        i < tries - 1 &&
        (msg.includes('Premature close') ||
          msg.includes('ECONNRESET') ||
          msg.includes('socket hang up') ||
          msg.includes('fetch failed') ||
          msg.includes('network'))
      ) {
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}
export async function handleGoogleCallback(code: string, ownerId: string) {
  const client = getOAuth2Client();
  const { tokens } = await getTokenWithRetry(client, code, 3);

  if (!tokens.access_token) {
    throw new Error('No access_token from Google');
  }
  // refresh_token may be missing on re-consent without prompt=consent
  if (!tokens.refresh_token) {
    const existing = await Prisma.googleConnection.findUnique({ where: { ownerId } });
    if (!existing?.refreshToken) {
      throw new Error(
        'No refresh_token. Open myaccount.google.com/permissions, remove this app, connect again.',
      );
    }
    tokens.refresh_token = existing.refreshToken;
  }

  client.setCredentials(tokens);

  let email: string | undefined;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const me = await oauth2.userinfo.get();
    email = me.data.email ?? undefined;
  } catch {
    /* ignore */
  }

  await Prisma.googleConnection.upsert({
    where: { ownerId },
    create: {
      ownerId,
      email: email ?? null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token!,
      expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
      scope: tokens.scope ?? SCOPES.join(' '),
    },
    update: {
      email: email ?? undefined,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token!,
      expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
      scope: tokens.scope ?? undefined,
    },
  });

  return { email };
}

export async function getAuthedGoogleClient(ownerId: string) {
  const conn = await Prisma.googleConnection.findUnique({ where: { ownerId } });
  if (!conn) {
    throw new Error('Google not connected. Connect with Google first.');
  }

  const client = getOAuth2Client();
  client.setCredentials({
    access_token: conn.accessToken,
    refresh_token: conn.refreshToken,
    expiry_date: conn.expiryDate ? Number(conn.expiryDate) : undefined,
  });

  client.on('tokens', async (tokens) => {
    try {
      await Prisma.googleConnection.update({
        where: { ownerId },
        data: {
          accessToken: tokens.access_token ?? undefined,
          expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : undefined,
          ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        },
      });
    } catch (e) {
      console.error('Failed to persist refreshed Google tokens', e);
    }
  });

  return client;
}

export async function getGoogleConnectionStatus(ownerId: string) {
  const conn = await Prisma.googleConnection.findUnique({
    where: { ownerId },
    select: { email: true, updatedAt: true, scope: true },
  });
  return conn
    ? { connected: true as const, email: conn.email, updatedAt: conn.updatedAt }
    : { connected: false as const };
}

export async function disconnectGoogle(ownerId: string) {
  await Prisma.googleConnection.deleteMany({ where: { ownerId } });
}

export type DriveFileItem = { id: string; name: string; modifiedTime?: string };

/** List spreadsheets the connected user can access */
export async function listUserSpreadsheets(ownerId: string, pageSize = 50): Promise<DriveFileItem[]> {
  const auth = await getAuthedGoogleClient(ownerId);
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize,
    spaces: 'drive',
    corpora: 'user',
  });
  return (res.data.files || []).map((f) => ({
    id: f.id!,
    name: f.name || 'Untitled',
    modifiedTime: f.modifiedTime || undefined,
  }));
}

/** List Google Docs the user can access (optional picker) */
export async function listUserDocs(ownerId: string, pageSize = 30): Promise<DriveFileItem[]> {
  const auth = await getAuthedGoogleClient(ownerId);
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.document' and trashed=false",
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize,
    spaces: 'drive',
    corpora: 'user',
  });
  return (res.data.files || []).map((f) => ({
    id: f.id!,
    name: f.name || 'Untitled',
    modifiedTime: f.modifiedTime || undefined,
  }));
}
