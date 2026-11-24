// Package mailer sends e-mail over SMTP (Mailpit in dev, Brevo relay in
// production). Every call is bounded by a short time-out so a slow or dead
// SMTP server can never hang the calling request.
package mailer

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	tmail "github.com/suppakorn-tae/cre-website/backend/templates/mail"
)

// DefaultTimeout bounds one Send call, dial included.
const DefaultTimeout = 10 * time.Second

// ErrSend is wrapped by every Send failure.
var ErrSend = errors.New("mailer: send failed")

// Message is one plain-text e-mail. Subject and Body are UTF-8.
type Message struct {
	To      string
	Subject string
	Body    string
}

// Mailer sends e-mail.
type Mailer interface {
	Send(ctx context.Context, msg Message) error
}

// SendOTP renders the Thai OTP e-mail from the template and sends it.
func SendOTP(ctx context.Context, m Mailer, to, code string, validMinutes int) error {
	subject, body, err := tmail.RenderOTP(tmail.OTPData{Code: code, ValidMinutes: validMinutes})
	if err != nil {
		return err
	}
	return m.Send(ctx, Message{To: to, Subject: subject, Body: body})
}

// Config configures the SMTP mailer. It mirrors the SMTP_* environment
// variables: Host=SMTP_HOST, Port=SMTP_PORT, User=SMTP_USER,
// Password=SMTP_PASSWORD, From=SMTP_FROM.
type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	From     string
	// Timeout bounds one Send call. Zero means DefaultTimeout.
	Timeout time.Duration
	// RequireTLS fails the send when the server does not offer STARTTLS.
	// Production (port 587) sets it; Mailpit in dev does not offer it.
	RequireTLS bool
	// TLSConfig overrides the STARTTLS client config (tests only).
	TLSConfig *tls.Config
}

// SMTP is a Mailer that talks to one SMTP server, upgrading with STARTTLS
// whenever the server offers it.
type SMTP struct {
	cfg  Config
	from *mail.Address
}

// NewSMTP validates cfg and returns the mailer. It does not connect.
func NewSMTP(cfg Config) (*SMTP, error) {
	if cfg.Host == "" || cfg.Port <= 0 {
		return nil, errors.New("mailer: host and port are required")
	}
	from, err := mail.ParseAddress(cfg.From)
	if err != nil {
		return nil, fmt.Errorf("mailer: invalid from address: %w", err)
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = DefaultTimeout
	}
	return &SMTP{cfg: cfg, from: from}, nil
}

// Send delivers msg. It returns within the configured time-out (or the
// context deadline if that is sooner).
func (s *SMTP) Send(ctx context.Context, msg Message) error {
	to, err := mail.ParseAddress(msg.To)
	if err != nil {
		return fmt.Errorf("%w: invalid recipient: %v", ErrSend, err)
	}
	if strings.ContainsAny(msg.Subject, "\r\n") {
		return fmt.Errorf("%w: subject contains a line break", ErrSend)
	}

	ctx, cancel := context.WithTimeout(ctx, s.cfg.Timeout)
	defer cancel()
	deadline, _ := ctx.Deadline()

	addr := net.JoinHostPort(s.cfg.Host, strconv.Itoa(s.cfg.Port))
	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("%w: dial: %v", ErrSend, err)
	}
	// One deadline covers every read and write on the connection, so a server
	// that accepts and then goes silent cannot block us.
	_ = conn.SetDeadline(deadline)
	// Closing the connection on cancellation unblocks any pending I/O.
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stop()

	if err := s.deliver(conn, to, build(s.from, to, msg)); err != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("%w: %v: %v", ErrSend, ctx.Err(), err)
		}
		return fmt.Errorf("%w: %v", ErrSend, err)
	}
	return nil
}

func (s *SMTP) deliver(conn net.Conn, to *mail.Address, data []byte) error {
	c, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("greeting: %w", err)
	}
	defer func() { _ = c.Close() }()

	if ok, _ := c.Extension("STARTTLS"); ok {
		tc := s.cfg.TLSConfig
		if tc == nil {
			tc = &tls.Config{MinVersion: tls.VersionTLS12}
		} else {
			tc = tc.Clone()
		}
		if tc.ServerName == "" {
			tc.ServerName = s.cfg.Host
		}
		if err := c.StartTLS(tc); err != nil {
			return fmt.Errorf("starttls: %w", err)
		}
	} else if s.cfg.RequireTLS {
		return errors.New("server does not offer STARTTLS")
	}
	if s.cfg.User != "" {
		if ok, _ := c.Extension("AUTH"); !ok {
			return errors.New("server does not offer AUTH")
		}
		if err := c.Auth(smtp.PlainAuth("", s.cfg.User, s.cfg.Password, s.cfg.Host)); err != nil {
			return fmt.Errorf("auth: %w", err)
		}
	}
	if err := c.Mail(s.from.Address); err != nil {
		return fmt.Errorf("mail from: %w", err)
	}
	if err := c.Rcpt(to.Address); err != nil {
		return fmt.Errorf("rcpt to: %w", err)
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("data: %w", err)
	}
	if _, err := w.Write(data); err != nil {
		return fmt.Errorf("write body: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("end data: %w", err)
	}
	_ = c.Quit()
	return nil
}

// build renders the RFC 5322 message: encoded-word subject and a base64
// UTF-8 body, so Thai text survives any relay.
func build(from, to *mail.Address, msg Message) []byte {
	var b strings.Builder
	h := func(k, v string) { b.WriteString(k + ": " + v + "\r\n") }
	h("From", from.String())
	h("To", to.String())
	h("Subject", mime.BEncoding.Encode("utf-8", msg.Subject))
	h("Date", time.Now().Format(time.RFC1123Z))
	h("MIME-Version", "1.0")
	h("Content-Type", "text/plain; charset=utf-8")
	h("Content-Transfer-Encoding", "base64")
	b.WriteString("\r\n")

	enc := base64.StdEncoding.EncodeToString([]byte(msg.Body))
	for len(enc) > 76 {
		b.WriteString(enc[:76] + "\r\n")
		enc = enc[76:]
	}
	b.WriteString(enc + "\r\n")
	return []byte(b.String())
}
