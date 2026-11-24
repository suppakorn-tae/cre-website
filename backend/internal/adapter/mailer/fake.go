package mailer

import (
	"context"
	"sync"
)

// Fake is an in-memory Mailer for unit tests.
type Fake struct {
	mu   sync.Mutex
	sent []Message
	// Err, when set, is returned by Send instead of recording the message.
	Err error
}

// Send records msg.
func (f *Fake) Send(ctx context.Context, msg Message) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.Err != nil {
		return f.Err
	}
	f.sent = append(f.sent, msg)
	return nil
}

// Sent returns a copy of the recorded messages.
func (f *Fake) Sent() []Message {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]Message(nil), f.sent...)
}

var (
	_ Mailer = (*Fake)(nil)
	_ Mailer = (*SMTP)(nil)
)
