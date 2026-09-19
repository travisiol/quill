"use client";

import { PROFILE_KEYS, type ProfileKey } from "@/lib/abi";
import { logInteraction } from "@/lib/log";
import type { ViewModel } from "@/lib/viewModel";
import { AvatarUploader, isAvatarValue } from "../ui/AvatarUploader";
import { ActionButton, Arrow, PageHeading } from "../ui/Basics";
import { Lookup } from "../ui/Lookup";
import { StatusDetails } from "../ui/StatusDetails";

export function Manage({ v }: { v: ViewModel }) {
  const locked = !v.ready || v.busy;
  const pick = (key: ProfileKey) => {
    v.fields.recordKey(key);
    v.fields.recordValue(v.texts[key] ?? "");
  };
  return (
    <>
      <PageHeading number="05" title="Manage your name.">
        Keep your destination current. Make changes with the active owner wallet.
      </PageHeading>
      <Lookup v={v} />
      <StatusDetails v={v} />
      <div className="manage-grid">
        <article>
          <p className="eyebrow">01 / RESOLUTION</p>
          <h2>Address record</h2>
          <p>Only the active NFT owner can edit. This address applies to this chain.</p>
          <form
            data-form="saveAddress"
            onSubmit={(e) => {
              e.preventDefault();
              logInteraction(`Form submitted: saveAddress, address: ${v.recordAddress}`);
              v.actions.saveAddress();
            }}
          >
            <label htmlFor="destination-input">Destination address</label>
            <input id="destination-input" value={v.recordAddress} onChange={(e) => v.fields.recordAddress(e.target.value)} placeholder="0x…" spellCheck={false} />
            <button disabled={locked}>
              Save address <Arrow />
            </button>
          </form>
        </article>
        <article>
          <p className="eyebrow">02 / PROFILE</p>
          <h2>Public profile records</h2>
          <div className="records-summary">
            <div className="record-chips">
              {PROFILE_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`record-chip ${v.recordKey === key ? "selected" : ""}`}
                  disabled={locked}
                  onClick={() => pick(key)}
                  title={`Select ${key}`}
                >
                  <strong>{key}</strong>
                  <span className="chip-value">{v.texts[key] ? (v.texts[key].length > 18 ? v.texts[key].slice(0, 16) + "…" : v.texts[key]) : "empty"}</span>
                </button>
              ))}
            </div>
          </div>
          <form
            data-form="saveRecord"
            onSubmit={(e) => {
              e.preventDefault();
              logInteraction(`Form submitted: saveRecord, key: ${v.recordKey}, value: ${v.recordValue}`);
              v.actions.saveRecord();
            }}
          >
            <label htmlFor="record-key">Record key</label>
            <select id="record-key" value={v.recordKey} onChange={(e) => pick(e.target.value as ProfileKey)}>
              {PROFILE_KEYS.map((key) => (
                <option key={key}>{key}</option>
              ))}
            </select>
            <label htmlFor="record-value">Public record value</label>
            {v.recordKey === "avatar" ? (
              <AvatarUploader v={v} />
            ) : (
              <textarea
                id="record-value"
                maxLength={512}
                value={v.recordValue}
                onChange={(e) => v.fields.recordValue(e.target.value)}
                placeholder={`Value for ${v.recordKey}...`}
              />
            )}
            <p>Public data. Website and X records are not verified.</p>
            <button disabled={locked || (v.recordKey === "avatar" && v.recordValue !== "" && !isAvatarValue(v.recordValue))}>
              Save record <Arrow />
            </button>
          </form>
        </article>
        <article>
          <p className="eyebrow">03 / CONTINUITY</p>
          <h2>Renew</h2>
          <p>Anyone may pay. Renewal keeps the owner and records, including in grace. Select a duration above.</p>
          <ActionButton v={v} id="renew" disabled={locked}>
            Requote and renew {v.years} year(s)
          </ActionButton>
        </article>
        <article>
          <p className="eyebrow">04 / IDENTITY</p>
          <h2>Primary name</h2>
          <p>You must own the active name and its address record must point to your wallet.</p>
          <div className="primary-name-status">
            <span className="mono">CURRENT PRIMARY: </span>
            {v.primaryName ? <span className="active-primary-badge">✓ {v.primaryName}</span> : <span className="muted">None active</span>}
          </div>
          <div className="button-stack">
            <ActionButton v={v} id="setPrimary" disabled={locked}>
              Set primary name
            </ActionButton>
            <ActionButton v={v} id="clearPrimary" disabled={locked} secondary>
              Clear primary name
            </ActionButton>
          </div>
        </article>
        <article>
          <p className="eyebrow">05 / OWNERSHIP</p>
          <h2>Transfer registration</h2>
          <p>Transfer preserves expiry and clears current records and primary-name validity, including a transfer to yourself.</p>
          <form
            data-form="transfer"
            onSubmit={(e) => {
              e.preventDefault();
              logInteraction(`Form submitted: transfer, recipient: ${v.recipient}`);
              v.actions.transfer();
            }}
          >
            <label htmlFor="recipient-input">New owner</label>
            <input id="recipient-input" value={v.recipient} onChange={(e) => v.fields.recipient(e.target.value)} placeholder="New owner 0x…" spellCheck={false} />
            <button disabled={locked}>
              Transfer NFT <Arrow />
            </button>
          </form>
        </article>
        <article>
          <p className="eyebrow">06 / PAYMENTS</p>
          <h2>Refund credit</h2>
          <p>Withdraw available credit from the controller to your connected wallet. Your wallet confirms the transaction.</p>
          <ActionButton v={v} id="refund" disabled={locked}>
            Withdraw my credit
          </ActionButton>
        </article>
      </div>
    </>
  );
}
