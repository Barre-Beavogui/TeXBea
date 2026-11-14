import React, { useState } from 'react';
import { Check, CreditCard, Sparkles, X, ExternalLink } from 'lucide-react';
import { formatSize } from './project-tools.js';

const DEFAULT_PLANS = [
  {
    id: 'free',
    name: 'Gratuit',
    priceMonthly: 0,
    quota: 200_000_000,
    features: [
      '200 Mo de sauvegarde cloud synchronisée',
      'Projets locaux illimités dans le navigateur',
      'Compilation PDF dans le navigateur (WebAssembly)',
      'Assistant IA local Bea & sauvegarde ZIP',
    ],
    available: true,
  },
  {
    id: 'standard',
    name: 'Standard',
    priceMonthly: 9,
    quota: 2_000_000_000,
    features: [
      '2 Go de sauvegarde cloud synchronisée (10× plus)',
      'Compilation sur le serveur : pdfLaTeX, XeLaTeX, LuaLaTeX, Biber (120 s)',
      'Partage par e-mail avec d’autres comptes TeXBea',
    ],
    available: true,
  },
  {
    id: 'pro',
    name: 'Professionnel',
    priceMonthly: 19,
    quota: 10_000_000_000,
    features: [
      '10 Go de sauvegarde cloud synchronisée (50× plus)',
      'Compilation sur le serveur jusqu’à 240 s (thèses, figures TikZ lourdes)',
      'Toutes les fonctions Standard',
    ],
    available: true,
  },
];

export default function PlansModal({ cloud, onClose }) {
  const [busyPlan, setBusyPlan] = useState('');
  const [error, setError] = useState('');
  const billing = cloud?.billing;
  const plans = billing?.plans?.length ? billing.plans : DEFAULT_PLANS;
  const sub = billing?.subscription || { plan: cloud?.usage?.plan || 'free', planName: 'Gratuit' };
  const currentPlan = sub.plan || 'free';
  const signedIn = Boolean(cloud?.user);

  async function subscribe(planId) {
    setError('');
    setBusyPlan(planId);
    try {
      await cloud.checkout(planId);
    } catch (e) {
      setError(e.message || 'Impossible d’ouvrir le paiement Stripe.');
      setBusyPlan('');
    }
  }

  async function managePortal() {
    setError('');
    setBusyPlan('portal');
    try {
      await cloud.openPortal();
    } catch (e) {
      setError(e.message || 'Impossible d’ouvrir le portail client Stripe.');
      setBusyPlan('');
    }
  }

  const periodEnd = sub.currentPeriodEnd
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(sub.currentPeriodEnd))
    : null;

  return (
    <div className="modalBack" onClick={onClose}>
      <div className="modal plans-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(880px, 100%)' }}>
        <div className="modalHead">
          <div>
            <h2>
              <Sparkles size={19} style={{ verticalAlign: '-3px', marginRight: 6 }} />
              Offres TeXBea — Abonnements mensuels
            </h2>
            <small style={{ color: 'var(--text-3)' }}>
              Sans engagement · Annulable à tout moment depuis ton portail Stripe
            </small>
          </div>
          <button className="icon" aria-label="Fermer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {!signedIn && (
          <div className="share-note" style={{ marginTop: 10 }}>
            Connecte-toi d’abord à la <b>Copie en ligne</b> (Google, GitHub ou code par e-mail) dans la carte Sauvegarde
            pour souscrire une offre sur ton compte.
          </div>
        )}

        {signedIn && currentPlan !== 'free' && (
          <div className="profile-section-card" style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <b>Offre actuelle : {sub.planName || currentPlan}</b>
                {periodEnd && (
                  <p style={{ margin: '2px 0 0', fontSize: 12 }}>
                    {sub.cancelAtPeriodEnd
                      ? `Fin de l’abonnement prévue le ${periodEnd}.`
                      : `Prochain renouvellement le ${periodEnd}.`}
                  </p>
                )}
              </div>
              {sub.hasCustomer && (
                <button type="button" disabled={busyPlan === 'portal'} onClick={managePortal}>
                  <CreditCard size={14} /> Gérer mon abonnement <ExternalLink size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="analysis-issue" style={{ marginTop: 10, color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        <div className="plans-grid">
          {plans.map((p) => {
            const isCurrent = signedIn && currentPlan === p.id;
            const isPopular = p.id === 'standard';
            return (
              <div key={p.id} className={'plan-card' + (isPopular ? ' popular' : '') + (isCurrent ? ' current' : '')}>
                {isPopular && <span className="plan-ribbon">Recommandé</span>}
                <div className="plan-head">
                  <h3>{p.name}</h3>
                  <div className="plan-price">
                    <b>{p.priceMonthly === 0 ? '0 €' : `${p.priceMonthly} €`}</b>
                    <span>/ mois</span>
                  </div>
                  <small className="plan-quota-badge">Quota cloud : {formatSize(p.quota)}</small>
                </div>
                <ul className="plan-features">
                  {(p.features || []).map((f, i) => (
                    <li key={i}>
                      <Check size={14} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="plan-foot">
                  {isCurrent ? (
                    <button type="button" disabled className="plan-btn">
                      Offre actuelle
                    </button>
                  ) : p.id === 'free' ? (
                    sub.hasCustomer ? (
                      <button type="button" className="plan-btn" disabled={!!busyPlan} onClick={managePortal}>
                        Gérer sur Stripe
                      </button>
                    ) : (
                      <button type="button" disabled className="plan-btn">
                        Inclus par défaut
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      className={'plan-btn' + (isPopular ? ' primary' : '')}
                      disabled={!signedIn || !p.available || !!busyPlan}
                      onClick={() => subscribe(p.id)}
                    >
                      <CreditCard size={14} />
                      {busyPlan === p.id
                        ? 'Redirection Stripe…'
                        : !p.available
                          ? 'Bientôt disponible'
                          : `Choisir ${p.name}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {signedIn && sub.hasCustomer && currentPlan === 'free' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="link" onClick={managePortal}>
              Accéder à mes factures Stripe
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
