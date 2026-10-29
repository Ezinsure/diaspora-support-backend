import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: SupabaseClient | null;
  private readonly bucket = process.env.SUPABASE_BUCKET ?? "request-documents";
  private readonly publicBucket = process.env.SUPABASE_PUBLIC_BUCKET ?? "public-assets";

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
    if (!this.client) this.logger.warn("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: file uploads are disabled.");
  }

  private from(bucket: string) {
    if (!this.client) throw new InternalServerErrorException("File storage is not configured");
    return this.client.storage.from(bucket);
  }

  async upload(path: string, body: Buffer, contentType: string) {
    const { error } = await this.from(this.bucket).upload(path, body, { contentType, upsert: false });
    if (error) {
      this.logger.error(`Upload failed for ${path}: ${error.message}`);
      throw new InternalServerErrorException("Could not upload the file");
    }
    return path;
  }

  async signedUrl(path: string, downloadName?: string, seconds = 300) {
    const { data, error } = await this.from(this.bucket).createSignedUrl(path, seconds, downloadName ? { download: downloadName } : undefined);
    if (error || !data) throw new InternalServerErrorException("Could not create a download link");
    return { url: data.signedUrl, expiresIn: seconds };
  }

  // Best effort: a leftover file is better than a crash
  async remove(paths: string[]) {
    if (!paths.length || !this.client) return;
    const { error } = await this.from(this.bucket).remove(paths);
    if (error) this.logger.warn(`Could not remove ${paths.join(", ")}: ${error.message}`);
  }

  // ---------- (logo) ----------

  // Returns a permanent public URL
  async uploadPublic(path: string, body: Buffer, contentType: string) {
    const storage = this.from(this.publicBucket);
    const { error } = await storage.upload(path, body, { contentType, upsert: true, cacheControl: "3600" });
    if (error) {
      this.logger.error(`Public upload failed for ${path}: ${error.message}`);
      throw new InternalServerErrorException("Could not upload the image");
    }
    return storage.getPublicUrl(path).data.publicUrl;
  }

  // Remove a public file from its URL (only files of our own public bucket)
  async removePublicUrl(url: string) {
    if (!this.client || !url) return;
    const marker = `/storage/v1/object/public/${this.publicBucket}/`;
    const index = url.indexOf(marker);
    if (index === -1) return; // not one of ours (e.g. a link typed by hand)
    const path = decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
    const { error } = await this.from(this.publicBucket).remove([path]);
    if (error) this.logger.warn(`Could not remove ${path}: ${error.message}`);
  }
}