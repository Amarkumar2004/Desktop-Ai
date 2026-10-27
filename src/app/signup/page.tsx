'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Mail, Building2, Check, ArrowRight, Shield } from 'lucide-react';
import AuthCardLayout from '@/components/account/AuthCardLayout';
import Input from '@/components/account/ui/Input';
import PasswordField from '@/components/account/ui/PasswordField';
import Button from '@/components/account/ui/Button';
import Alert from '@/components/account/ui/Alert';
import { useAuth } from '@/lib/auth/AuthContext';
import { useToast } from '@/lib/toast/ToastContext';

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const { success, error: toastError } = useToast();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Validation & Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successBanner, setSuccessBanner] = useState(false);

  // Real-time password requirement checks
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!fullName.trim()) newErrors.fullName = 'Please enter your full name.';
    if (!email.trim()) {
      newErrors.email = 'Please enter your work email.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid work email address.';
    }
    if (!workspaceName.trim()) newErrors.workspaceName = 'Please enter a workspace name.';
    if (!password) {
      newErrors.password = 'Password is required.';
    } else if (!hasMinLength || !hasUppercase || !hasNumber) {
      newErrors.password = 'Please meet all password requirements.';
    }
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password.';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match.';
    }
    if (!agreeTerms) {
      newErrors.terms = 'You must agree to the Terms of Service & Privacy Policy.';
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsLoading(true);
    try {
      const res = await signup({
        fullName,
        email,
        workspaceName,
        password,
      });

      if (res.success) {
        setSuccessBanner(true);
        success('Workspace created!', `Welcome to SUSI AI, ${fullName}`);
        setTimeout(() => {
          router.push('/');
        }, 1200);
      } else {
        toastError('Signup Failed', res.error || 'Unable to create account');
        setErrors({ general: res.error || 'Registration failed' });
      }
    } catch {
      toastError('Error', 'An unexpected error occurred during signup');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCardLayout
      title="Create your workspace"
      subtitle="Build and manage your autonomous AI workforce."
      backHref="/login"
      backLabel="← Sign In"
      maxWidth="max-w-lg"
    >
      {successBanner && (
        <Alert
          variant="success"
          title="Workspace Created!"
          className="mb-4"
        >
          Your autonomous workspace is ready. Redirecting to your dashboard...
        </Alert>
      )}

      {errors.terms && (
        <Alert
          variant="error"
          onClose={() => setErrors((prev) => ({ ...prev, terms: '' }))}
          className="mb-4"
        >
          {errors.terms}
        </Alert>
      )}

      {errors.general && (
        <Alert
          variant="error"
          onClose={() => setErrors((prev) => ({ ...prev, general: '' }))}
          className="mb-4"
        >
          {errors.general}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Full Name */}
        <Input
          label="Full Name"
          type="text"
          placeholder="e.g. Alex Rivera"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={errors.fullName}
          disabled={isLoading}
          leftIcon={<User className="w-4 h-4" />}
          required
        />

        {/* Work Email */}
        <Input
          label="Work Email"
          type="email"
          placeholder="alex@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          disabled={isLoading}
          leftIcon={<Mail className="w-4 h-4" />}
          required
        />

        {/* Workspace Name */}
        <Input
          label="Workspace Name"
          type="text"
          placeholder="e.g. Acme AI Swarm"
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          error={errors.workspaceName}
          disabled={isLoading}
          leftIcon={<Building2 className="w-4 h-4" />}
          helperText="You can invite team members and link agents after setup."
          required
        />

        {/* Password */}
        <div className="space-y-1">
          <PasswordField
            label="Password"
            placeholder="Create a strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            disabled={isLoading}
            showStrength
            required
          />
        </div>

        {/* Confirm Password */}
        <PasswordField
          label="Confirm Password"
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
          disabled={isLoading}
          required
        />

        {/* Password Requirements Helper Card */}
        <div className="p-3.5 bg-stone-50/90 border border-stone-200/80 rounded-xl space-y-2 select-none">
          <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
            <Shield className="w-3.5 h-3.5 text-amber-600" />
            <span>Password Requirements</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                  hasMinLength ? 'bg-emerald-500 text-white' : 'bg-stone-200 text-stone-400'
                }`}
              >
                <Check className="w-2.5 h-2.5" />
              </span>
              <span className={hasMinLength ? 'text-emerald-700 font-semibold' : 'text-stone-500'}>
                8+ characters
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                  hasUppercase ? 'bg-emerald-500 text-white' : 'bg-stone-200 text-stone-400'
                }`}
              >
                <Check className="w-2.5 h-2.5" />
              </span>
              <span className={hasUppercase ? 'text-emerald-700 font-semibold' : 'text-stone-500'}>
                Uppercase letter
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                  hasNumber ? 'bg-emerald-500 text-white' : 'bg-stone-200 text-stone-400'
                }`}
              >
                <Check className="w-2.5 h-2.5" />
              </span>
              <span className={hasNumber ? 'text-emerald-700 font-semibold' : 'text-stone-500'}>
                One number
              </span>
            </div>
          </div>
        </div>

        {/* Terms and conditions */}
        <div className="pt-1">
          <label className="flex items-start gap-2.5 cursor-pointer select-none text-xs text-stone-600">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              disabled={isLoading}
              className="mt-0.5 w-4 h-4 rounded border-stone-300 text-amber-500 focus:ring-amber-400 accent-amber-500 cursor-pointer"
            />
            <span>
              I agree to the{' '}
              <a href="#" className="font-semibold text-stone-800 underline hover:text-amber-600">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#" className="font-semibold text-stone-800 underline hover:text-amber-600">
                Privacy Policy
              </a>
              .
            </span>
          </label>
        </div>

        {/* Submit button */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isLoading}
          rightIcon={<ArrowRight className="w-4 h-4" />}
        >
          Create account
        </Button>
      </form>

      {/* Already have an account */}
      <div className="pt-2 text-center text-xs text-stone-600">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-bold text-amber-600 hover:text-amber-700 hover:underline transition-colors"
        >
          Sign in
        </Link>
      </div>
    </AuthCardLayout>
  );
}
