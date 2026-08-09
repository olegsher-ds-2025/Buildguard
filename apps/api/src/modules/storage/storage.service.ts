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
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>("S3_BUCKET");
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>("S3_ENDPOINT"),
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow<string>("S3_ACCESS_KEY"),
        secretAccessKey: config.getOrThrow<string>("S3_SECRET_KEY"),
      },
    });
  }

  getUploadUrl(objectKey: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, ContentType: contentType });
    return getSignedUrl(this.client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  }

  getDownloadUrl(objectKey: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: objectKey });
    return getSignedUrl(this.client, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
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
