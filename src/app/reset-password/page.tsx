'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Lock, ArrowRight, ShieldCheck } from 'lucide-react';
import AuthCardLayout from '@/components/account/AuthCardLayout';
import PasswordField from '@/components/account/ui/PasswordField';
import Button from '@/components/account/ui/Button';
import Alert from '@/components/account/ui/Alert';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setConfirmError('');

    let hasErr = false;
    if (!newPassword) {
      setPasswordError('Please enter a new password.');
      hasErr = true;
    } else if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      hasErr = true;
    }

    if (!confirmPassword) {
      setConfirmError('Please confirm your new password.');
      hasErr = true;
    } else if (newPassword !== confirmPassword) {
      setConfirmError('Passwords do not match.');
      hasErr = true;
    }

    if (hasErr) return;

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsSuccess(true);
    }, 1100);
  };

  if (isSuccess) {
    return (
      <AuthCardLayout
        title="Password updated"
        subtitle="Your new credentials have been saved."
        backHref="/login"
        backLabel="← Back to Sign In"
      >
        <div className="space-y-5 text-center sm:text-left animate-in fade-in duration-200">
          <div className="flex items-center justify-center sm:justify-start">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-300/80 flex items-center justify-center text-emerald-600 shadow-sm">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-stone-900">
              Password updated successfully
            </h3>
            <p className="text-xs sm:text-sm text-stone-500">
              You can now sign in to your SUSI AI workspace with your new password. All active
              sessions remain protected.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center w-full px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl shadow-xs transition-colors gap-2"
            >
              <span>Back to sign in</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </AuthCardLayout>
    );
  }

  return (
    <AuthCardLayout
      title="Set a new password"
      subtitle="Create a strong, unique password for your account."
      backHref="/login"
      backLabel="← Back to Sign In"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* New Password */}
        <PasswordField
          label="New Password"
          placeholder="Enter new password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={passwordError}
          disabled={isLoading}
          showStrength
          required
        />

        {/* Confirm Password */}
        <PasswordField
          label="Confirm New Password"
          placeholder="Re-enter new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={confirmError}
          disabled={isLoading}
          required
        />

        {/* Helper Note */}
        <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-xl text-[11px] text-stone-600 flex items-start gap-2 select-none">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>
            Must contain at least 8 characters, including one uppercase letter and one numeric digit.
          </span>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isLoading}
          rightIcon={<ArrowRight className="w-4 h-4" />}
        >
          Update password
        </Button>
      </form>
    </AuthCardLayout>
  );
}
