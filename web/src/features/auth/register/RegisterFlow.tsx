'use client';

import { useState } from 'react';

import type { OtpChallenge } from './api';
import { AuthShell } from './AuthShell';
import { ChooseMethod } from './ChooseMethod';
import { OtpStep } from './OtpStep';
import { SignupForm } from './SignupForm';

type Step =
  | { name: 'choose' }
  | { name: 'form'; email: string }
  | { name: 'otp'; email: string; challenge: OtpChallenge };

/** Sign-up: choose a method, fill the form, confirm the e-mail with an OTP. */
export function RegisterFlow() {
  const [step, setStep] = useState<Step>({ name: 'choose' });
  return (
    <AuthShell>
      {step.name === 'choose' && (
        <ChooseMethod onEmail={() => setStep({ name: 'form', email: '' })} />
      )}
      {step.name === 'form' && (
        <SignupForm
          initialEmail={step.email}
          onBack={() => setStep({ name: 'choose' })}
          onSent={(email, challenge) => setStep({ name: 'otp', email, challenge })}
        />
      )}
      {step.name === 'otp' && (
        <OtpStep
          email={step.email}
          challenge={step.challenge}
          onBack={() => setStep({ name: 'form', email: step.email })}
        />
      )}
    </AuthShell>
  );
}
