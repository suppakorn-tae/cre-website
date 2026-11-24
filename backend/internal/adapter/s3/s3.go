// Package s3 stores report and export files through the S3 API. It works with
// RustFS (dev and production), MinIO and AWS S3.
package s3

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Key prefixes. Every object key must start with one of them.
const (
	PrefixReports = "reports/"
	PrefixExports = "exports/"
)

var (
	// ErrNotFound is returned when the object does not exist.
	ErrNotFound = errors.New("s3: object not found")
	// ErrInvalidKey is returned for a key outside the allowed prefixes.
	ErrInvalidKey = errors.New("s3: invalid object key")
)

// Config mirrors the S3_* environment variables: Endpoint=S3_ENDPOINT (a URL
// such as http://rustfs:9000), Region=S3_REGION, Bucket=S3_BUCKET,
// AccessKey=S3_ACCESS_KEY, SecretKey=S3_SECRET_KEY.
type Config struct {
	Endpoint  string
	Region    string
	Bucket    string
	AccessKey string
	SecretKey string
}

// Store is one bucket.
type Store struct {
	client *minio.Client
	bucket string
	region string
}

// New builds a Store. It does not contact the server.
func New(cfg Config) (*Store, error) {
	if cfg.Endpoint == "" || cfg.Bucket == "" {
		return nil, errors.New("s3: endpoint and bucket are required")
	}
	u, err := url.Parse(cfg.Endpoint)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, fmt.Errorf("s3: endpoint must be an http(s) URL, got %q", cfg.Endpoint)
	}
	client, err := minio.New(u.Host, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: u.Scheme == "https",
		Region: cfg.Region,
		// Path-style addressing: RustFS and MinIO have no bucket sub-domains.
		BucketLookup: minio.BucketLookupPath,
	})
	if err != nil {
		return nil, fmt.Errorf("s3: build client: %w", err)
	}
	return &Store{client: client, bucket: cfg.Bucket, region: cfg.Region}, nil
}

// EnsureBucket creates the bucket when it does not exist yet.
func (s *Store) EnsureBucket(ctx context.Context) error {
	ok, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return fmt.Errorf("s3: check bucket: %w", err)
	}
	if ok {
		return nil
	}
	if err := s.client.MakeBucket(ctx, s.bucket, minio.MakeBucketOptions{Region: s.region}); err != nil {
		return fmt.Errorf("s3: create bucket: %w", err)
	}
	return nil
}

// Put streams r into key. size is the exact length, or -1 when unknown (the
// body is then uploaded in parts).
func (s *Store) Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error {
	if err := checkKey(key); err != nil {
		return err
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	_, err := s.client.PutObject(ctx, s.bucket, key, r, size, minio.PutObjectOptions{ContentType: contentType})
	if err != nil {
		return fmt.Errorf("s3: put %s: %w", key, err)
	}
	return nil
}

// Get opens key for streaming. The caller must close the result. It returns
// ErrNotFound when the object does not exist.
func (s *Store) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	if err := checkKey(key); err != nil {
		return nil, err
	}
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("s3: get %s: %w", key, err)
	}
	// GetObject is lazy; Stat surfaces a missing key now rather than on Read.
	if _, err := obj.Stat(); err != nil {
		_ = obj.Close()
		if isNotFound(err) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("s3: get %s: %w", key, err)
	}
	return obj, nil
}

// Exists reports whether key exists.
func (s *Store) Exists(ctx context.Context, key string) (bool, error) {
	if err := checkKey(key); err != nil {
		return false, err
	}
	_, err := s.client.StatObject(ctx, s.bucket, key, minio.StatObjectOptions{})
	if err == nil {
		return true, nil
	}
	if isNotFound(err) {
		return false, nil
	}
	return false, fmt.Errorf("s3: stat %s: %w", key, err)
}

// Delete removes key. Deleting a missing key is not an error.
func (s *Store) Delete(ctx context.Context, key string) error {
	if err := checkKey(key); err != nil {
		return err
	}
	if err := s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		if isNotFound(err) {
			return nil
		}
		return fmt.Errorf("s3: delete %s: %w", key, err)
	}
	return nil
}

func checkKey(key string) error {
	if !strings.HasPrefix(key, PrefixReports) && !strings.HasPrefix(key, PrefixExports) {
		return fmt.Errorf("%w: %q must start with %q or %q", ErrInvalidKey, key, PrefixReports, PrefixExports)
	}
	if len(key) == len(PrefixReports) && strings.HasPrefix(key, PrefixReports) ||
		len(key) == len(PrefixExports) && strings.HasPrefix(key, PrefixExports) {
		return fmt.Errorf("%w: %q has no name after the prefix", ErrInvalidKey, key)
	}
	if strings.Contains(key, "..") || strings.Contains(key, "//") {
		return fmt.Errorf("%w: %q", ErrInvalidKey, key)
	}
	return nil
}

func isNotFound(err error) bool {
	return minio.ToErrorResponse(err).Code == minio.NoSuchKey || minio.ToErrorResponse(err).StatusCode == 404
}
