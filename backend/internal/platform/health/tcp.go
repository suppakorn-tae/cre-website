package health

import (
	"context"
	"fmt"
	"net"
	"net/url"
)

// TCP returns a Check that dials addr (host:port). It is the placeholder
// readiness probe until the real clients (pgx, Valkey) are wired in.
func TCP(addr string) Check {
	return func(ctx context.Context) error {
		var d net.Dialer
		c, err := d.DialContext(ctx, "tcp", addr)
		if err != nil {
			return err
		}
		return c.Close()
	}
}

// HostPortFromURL extracts host:port from a URL, using defPort when absent.
func HostPortFromURL(raw, defPort string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" {
		return "", fmt.Errorf("not a URL with a host")
	}
	p := u.Port()
	if p == "" {
		p = defPort
	}
	return net.JoinHostPort(u.Hostname(), p), nil
}
