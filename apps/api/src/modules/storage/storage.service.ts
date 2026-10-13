import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GetObjectCommand, HeadObjectCommand, NotFound as S3NotFound, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

/**
 * Storage-first (design doc §5.2): the API only ever hands out presigned
 * URLs. File bytes flow directly between the client and object storage,
 * never through this process.
 */
@Injectable()
export class StorageService {
  /** Talks to storage from inside the deployment (HEAD, GET). */
  private readonly client: S3Client;
  /** Only signs URLs handed to browsers, so its endpoint must be one a browser can reach. */
  private readonly signer: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>("S3_BUCKET");
    const endpoint = config.getOrThrow<string>("S3_ENDPOINT");
    const credentials = {
      accessKeyId: config.getOrThrow<string>("S3_ACCESS_KEY"),
      secretAccessKey: config.getOrThrow<string>("S3_SECRET_KEY"),
    };
    const make = (url: string) => new S3Client({ endpoint: url, region: "us-east-1", forcePathStyle: true, credentials });
    this.client = make(endpoint);
    // In a container network the internal host (e.g. http://minio:9000) means nothing to a browser.
    this.signer = make(config.get<string>("S3_PUBLIC_ENDPOINT") ?? endpoint);
  }

  getUploadUrl(objectKey: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, ContentType: contentType });
    return getSignedUrl(this.signer, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  }

  getDownloadUrl(objectKey: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: objectKey });
    return getSignedUrl(this.signer, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
  }

  /** Whole object as a buffer, or null if it is missing. Used when building reports and the building file. */
  async getObjectBuffer(objectKey: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null;
    } catch {
      // A missing or unreadable file must not sink a whole export; callers list what they could not read.
      return null;
    }
  }

  /** Used by "confirm" endpoints to verify a claimed upload actually happened before persisting anything. */
  async objectExists(objectKey: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return true;
    } catch (err) {
      if (err instanceof S3NotFound || (err as { name?: string }).name === "NotFound") return false;
      throw err;
    }
  }
}
