// One-shot: waits for S3-compatible storage to answer, then creates the bucket if it is missing.
// Run inside the API image (it already ships the AWS SDK), so no separate `mc` client is needed.
const { S3Client, HeadBucketCommand, CreateBucketCommand } = require("@aws-sdk/client-s3");

const bucket = process.env.S3_BUCKET;
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
});

async function main() {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      console.log(`bucket ${bucket} exists`);
      return;
    } catch (err) {
      if (err.$metadata && err.$metadata.httpStatusCode === 404) {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`bucket ${bucket} created`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  console.error("storage did not become ready");
  process.exit(1);
}

main();
