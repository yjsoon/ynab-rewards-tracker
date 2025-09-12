'use client';

import Link from 'next/link';
import { useState } from 'react';

interface SetupPromptProps {
  onDismiss?: () => void;
}

export function SetupPrompt({ onDismiss }: SetupPromptProps) {
  const [isVisible, setIsVisible] = useState(true);

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) return null;

  return (
    <div style={{
      backgroundColor: '#fff3cd',
      border: '1px solid #ffc107',
      borderRadius: 8,
      padding: 20,
      marginBottom: 30,
      position: 'relative',
    }}>
      <button
        onClick={handleDismiss}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          background: 'none',
          border: 'none',
          fontSize: '1.5rem',
          cursor: 'pointer',
          color: '#666',
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
      
      <h2 style={{ marginTop: 0, marginBottom: 15 }}>Welcome to YNAB Rewards Tracker!</h2>
      
      <p style={{ marginBottom: 15 }}>
        Get started by connecting your YNAB account to start tracking credit card rewards and maximizing your cashback.
      </p>
      
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: 10 }}>Quick Setup Steps:</h3>
        <ol style={{ marginLeft: 20 }}>
          <li>Get your YNAB Personal Access Token</li>
          <li>Select your budget</li>
          <li>Choose accounts to track for rewards</li>
          <li>Set up reward rules for each card</li>
        </ol>
      </div>
      
      <Link 
        href="/settings" 
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: '#007bff',
          color: 'white',
          textDecoration: 'none',
          borderRadius: 4,
          fontWeight: 'bold',
        }}
      >
        Get Started →
      </Link>
    </div>
  );
}