package s3_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"errors"
	"io"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/suppakorn-tae/cre-website/backend/internal/adapter/s3"
)

const (
	accessKey = "rustfsadmin"
	secretKey = "rustfsadmin-secret" //nolint:gosec // G101: test fixture, not a real credential
)

// startStore runs RustFS, not MinIO: the minio/minio and quay.io/minio/minio
// images can no longer be pulled. RustFS is also the store we deploy.
func startStore(t *testing.T) *s3.Store {
	t.Helper()
	st, _ := startStoreAt(t)
	return st
}

// startStoreAt also returns the endpoint, for tests that need a second bucket.
func startStoreAt(t *testing.T) (*s3.Store, string) {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test needs Docker")
	}
	ctx := context.Background()
	c, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "rustfs/rustfs:latest",
			ExposedPorts: []string{"9000/tcp"},
			Env: map[string]string{
				"RUSTFS_ACCESS_KEY": accessKey,
				"RUSTFS_SECRET_KEY": secretKey,
			},
			WaitingFor: wait.ForHTTP("/health").WithPort("9000/tcp").WithStartupTimeout(2 * time.Minute),
		},
		Started: true,
	})
	if err != nil {
		t.Fatalf("start rustfs: %v", err)
	}
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(c) })

	endpoint, err := c.PortEndpoint(ctx, "9000/tcp", "http")
	if err != nil {
		t.Fatal(err)
	}
	st, err := s3.New(s3.Config{
		Endpoint: endpoint, Region: "us-east-1", Bucket: "cre",
		AccessKey: accessKey, SecretKey: secretKey,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.EnsureBucket(ctx); err != nil {
		t.Fatal(err)
	}
	return st, endpoint
}

func TestStoreRoundTrip(t *testing.T) {
	st := startStore(t)
	ctx := context.Background()

	data := make([]byte, 6<<20) // above one part, exercises streaming
	if _, err := rand.Read(data); err != nil {
		t.Fatal(err)
	}
	key := s3.PrefixReports + "p1/report.pdf"

	if ok, err := st.Exists(ctx, key); err != nil || ok {
		t.Fatalf("Exists before put = %v, %v", ok, err)
	}
	if err := st.Put(ctx, key, bytes.NewReader(data), int64(len(data)), "application/pdf"); err != nil {
		t.Fatalf("put: %v", err)
	}
	if ok, err := st.Exists(ctx, key); err != nil || !ok {
		t.Fatalf("Exists after put = %v, %v", ok, err)
	}

	rc, err := st.Get(ctx, key)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	got, err := io.ReadAll(rc)
	_ = rc.Close()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, data) {
		t.Fatalf("downloaded %d bytes differ from the %d uploaded", len(got), len(data))
	}

	if err := st.Delete(ctx, key); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if ok, _ := st.Exists(ctx, key); ok {
		t.Error("object still exists after delete")
	}
	if err := st.Delete(ctx, key); err != nil {
		t.Errorf("deleting a missing key: %v", err)
	}
	if _, err := st.Get(ctx, key); !errors.Is(err, s3.ErrNotFound) {
		t.Errorf("get missing err = %v, want ErrNotFound", err)
	}
}

func TestStorePutUnknownSize(t *testing.T) {
	st := startStore(t)
	ctx := context.Background()
	key := s3.PrefixExports + "e1/data.csv"
	body := []byte("a,b\n1,2\n")

	if err := st.Put(ctx, key, io.MultiReader(bytes.NewReader(body)), -1, "text/csv"); err != nil {
		t.Fatalf("put: %v", err)
	}
	rc, err := st.Get(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = rc.Close() }()
	got, _ := io.ReadAll(rc)
	if !bytes.Equal(got, body) {
		t.Errorf("got %q", got)
	}
}

func TestEnsureBucket(t *testing.T) {
	st := startStore(t) // startStore already created the bucket once

	created, err := st.EnsureBucket(context.Background())
	if err != nil || created {
		t.Fatalf("existing bucket: created=%v err=%v, want false, nil", created, err)
	}
}

func TestEnsureBucketCreatesAndRaces(t *testing.T) {
	_, endpoint := startStoreAt(t)
	ctx := context.Background()
	fresh, err := s3.New(s3.Config{
		Endpoint: endpoint, Region: "us-east-1", Bucket: "fresh",
		AccessKey: accessKey, SecretKey: secretKey,
	})
	if err != nil {
		t.Fatal(err)
	}

	const n = 4
	var wg sync.WaitGroup
	var made atomic.Int32
	errs := make(chan error, n)
	for range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			created, err := fresh.EnsureBucket(ctx)
			if err != nil {
				errs <- err
			}
			if created {
				made.Add(1)
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Errorf("concurrent EnsureBucket: %v", err)
	}
	// Some servers answer a repeated create with success, so more than one
	// caller may report "created"; at least one must.
	if made.Load() < 1 {
		t.Errorf("no caller reported creating the bucket")
	}
	key := s3.PrefixReports + "p/x.pdf"
	if err := fresh.Put(ctx, key, bytes.NewReader([]byte("x")), 1, "application/pdf"); err != nil {
		t.Fatalf("put into new bucket: %v", err)
	}
}
