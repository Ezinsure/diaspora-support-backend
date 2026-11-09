import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

/**
 * Files are kept on this server's disk (the AOS server), in STORAGE_DIR:
 *
 *   STORAGE_DIR/
 *     private/requests/<request id>/<uuid>-passport.pdf   customer documents (never public)
 * PRIVATE files are opened only with a signed link that expires (5 min), served by FilesController.
 * PUBLIC files have a permanent URL.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);

  private readonly root = resolve(process.env.STORAGE_DIR ?? 'storage');
  private readonly privateDir = resolve(this.root, 'private');
  private readonly publicDir = resolve(this.root, 'public');

  // Signs the private links
  private readonly secret =
    process.env.STORAGE_SECRET ||
    process.env.JWT_SECRET ||
    randomBytes(32).toString('hex');

  // Address of this API as browsers reach it (used in file links)
  private readonly apiUrl = (
    process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 5000}`
  ).replace(/\/+$/, '');
  private readonly prefix = process.env.API_PREFIX ?? 'v1';

  // Create the folders at start-up and fail early if the disk isn't writable
  async onModuleInit() {
    try {
      await mkdir(this.privateDir, { recursive: true, mode: 0o750 });
      await mkdir(this.publicDir, { recursive: true, mode: 0o755 });
    } catch (e: any) {
      this.logger.error(
        `Can't create the storage folder ${this.root}: ${e.message}`,
      );
      throw e;
    }
    if (!process.env.STORAGE_SECRET)
      this.logger.warn(
        'STORAGE_SECRET not set: using JWT_SECRET to sign file links.',
      );
    this.logger.log(`Files are stored in ${this.root}`);
  }

  // Private documents
  async upload(path: string, body: Buffer, _contentType?: string) {
    await this.write(this.privateDir, path, body, 0o640);
    return path;
  }

  // Temporary link to open / download the file (default 5 minutes)
  async signedUrl(path: string, downloadName?: string, seconds = 300) {
    const token = this.sign({
      p: path,
      n: downloadName ?? path.split('/').pop(),
      e: Math.floor(Date.now() / 1000) + seconds,
    });
    return {
      url: `${this.apiUrl}/${this.prefix}/files/${token}`,
      expiresIn: seconds,
    };
  }

  // Best effort
  async remove(paths: string[]) {
    for (const p of paths) {
      try {
        await rm(this.safePath(this.privateDir, p), { force: true });
      } catch (e: any) {
        this.logger.warn(`Could not remove ${p}: ${e.message}`);
      }
    }
  }

  //  Public files (logo, images)

  // Returns a permanent public URL
  async uploadPublic(path: string, body: Buffer, _contentType?: string) {
    const [folder, file] = this.splitPublic(path);
    await this.write(this.publicDir, `${folder}/${file}`, body, 0o644);
    return `${this.apiUrl}/${this.prefix}/files/public/${folder}/${file}`;
  }

  // Remove a public file from its URL
  async removePublicUrl(url: string) {
    if (!url) return;
    const marker = `/${this.prefix}/files/public/`;
    const index = url.indexOf(marker);
    if (index === -1) return;
    const path = decodeURIComponent(
      url.slice(index + marker.length).split('?')[0],
    );
    try {
      await rm(this.safePath(this.publicDir, path), { force: true });
    } catch (e: any) {
      this.logger.warn(`Could not remove ${path}: ${e.message}`);
    }
  }

  //  Used by FilesController

  // Token -> file on disk + its name. 404 when expired or changed.
  async resolvePrivate(token: string) {
    const data = this.verify(token);
    if (!data)
      throw new NotFoundException('This link is invalid or has expired');
    const file = this.safePath(this.privateDir, data.p);
    if (!(await this.isFile(file)))
      throw new NotFoundException('File not found');
    return { file, name: String(data.n || 'document') };
  }

  async resolvePublic(folder: string, name: string) {
    const file = this.safePath(this.publicDir, `${folder}/${name}`);
    if (!(await this.isFile(file)))
      throw new NotFoundException('File not found');
    return file;
  }

  // Helpers
  // Never let a path escape the storage folder
  private safePath(base: string, relative: string) {
    const full = resolve(base, relative);
    if (!full.startsWith(base + sep))
      throw new BadRequestException('Invalid file path');
    return full;
  }

  private async write(
    base: string,
    relative: string,
    body: Buffer,
    mode: number,
  ) {
    const file = this.safePath(base, relative);
    try {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, body, { flag: 'wx', mode });
    } catch (e: any) {
      this.logger.error(`Saving ${relative} failed: ${e.message}`);
      throw new InternalServerErrorException('Could not save the file');
    }
  }

  // "company/logo.png"
  private splitPublic(path: string): [string, string] {
    const parts = path.split('/').filter(Boolean);
    const file = parts.pop() ?? 'file';
    return [parts.join('-') || 'files', file];
  }

  private async isFile(file: string) {
    try {
      return (await stat(file)).isFile();
    } catch {
      return false;
    }
  }

  // payload.signature
  private sign(payload: object) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.secret)
      .update(body)
      .digest('base64url');
    return `${body}.${sig}`;
  }

  private verify(token: string): { p: string; n?: string; e: number } | null {
    const [body, sig] = String(token ?? '').split('.');
    if (!body || !sig) return null;
    const expected = createHmac('sha256', this.secret)
      .update(body)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const data = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (
        !data?.p ||
        typeof data.e !== 'number' ||
        data.e < Math.floor(Date.now() / 1000)
      )
        return null;
      return data;
    } catch {
      return null;
    }
  }
}
