import AWS from 'aws-sdk';
const { S3 } = AWS;

interface OssConfig {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // S3 兼容服务的自定义 endpoint
  bucketName: string;
}

export class OssClient {
  private s3: AWS.S3;
  private bucketName: string;

  constructor() {
    const config: OssConfig = {
      accessKeyId: process.env['OSS_AK'] || '',
      secretAccessKey: process.env['OSS_SK'] || '',
      endpoint: process.env['ENDPOINT'] || '',
      bucketName: process.env['OSS_BUCKET'] || '',
    };

    if (!config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
      throw new Error('Missing required environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, or AWS_BUCKET_NAME');
    }

    this.bucketName = config.bucketName;

    this.s3 = new S3({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: config.endpoint,
      s3ForcePathStyle: true,
    });

  };

  /**
   * 上传文件
   * @param key 文件存储的路径
   * @param body 文件内容（Buffer、ReadableStream 或字符串）
   */
  async uploadFile(key: string, body: AWS.S3.Body): Promise<string> {
    const params = {
      Bucket: this.bucketName,
      Key: key,
      Body: body,
    };

    try {
      const result = await this.s3.upload(params).promise();
      return result.Location;
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  /**
   * 下载文件
   * @param key 文件存储的路径
   */
  async downloadFile(key: string): Promise<Buffer> {
    const params = {
      Bucket: this.bucketName,
      Key: key,
    };

    try {
      const result = await this.s3.getObject(params).promise();
      return result.Body as Buffer;
    } catch (error) {
      console.error('Error downloading file:', error);
      throw error;
    }
  }

  /**
   * 列出存储桶中的文件
   * @param prefix 前缀路径
   */
  async listFiles(prefix: string = ''): Promise<AWS.S3.ObjectList> {
    const params = {
      Bucket: this.bucketName,
      Prefix: prefix,
    };

    try {
      const result = await this.s3.listObjectsV2(params).promise();
      return result.Contents || [];
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  }

  /**
   * 删除文件
   * @param key 文件存储的路径
   */
  async deleteFile(key: string): Promise<void> {
    const params = {
      Bucket: this.bucketName,
      Key: key,
    };

    try {
      await this.s3.deleteObject(params).promise();
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }
}


