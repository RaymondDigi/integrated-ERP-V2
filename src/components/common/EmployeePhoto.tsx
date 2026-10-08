import React, { useRef, useState } from 'react';
import { Camera, LoaderCircle, Trash2 } from 'lucide-react';
import { initialsOf, readPhoto } from '../../utils/photo';

/** The employee's photo, or their initials when none is on file. */
export const EmployeeAvatar: React.FC<{
  name: string;
  photoUrl?: string;
  size?: number;
  className?: string;
}> = ({ name, photoUrl, size = 36, className = '' }) =>
  photoUrl ? (
    <img className={`emp-avatar ${className}`} src={photoUrl} alt={name} width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span
      className={`emp-avatar emp-avatar-initials ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.36))
      }}
      aria-label={name}
      role="img"
    >
      {initialsOf(name)}
    </span>
  );

interface UploadProps {
  name: string;
  photoUrl?: string;
  onChange: (photoUrl: string | undefined) => void;
  onError?: (message: string) => void;
  size?: number;
  /** Show "Upload / Change photo" and "Remove" buttons beside the picture */
  withButtons?: boolean;
  hint?: string;
}

/** Photo with a camera button: crops to a square and hands back a small data URL. */
export const PhotoUpload: React.FC<UploadProps> = ({ name, photoUrl, onChange, onError, size = 88, withButtons = true, hint = 'JPG, PNG or WebP, under 5 MB. Cropped to a square.' }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      onChange(await readPhoto(file));
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'This image could not be used.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="emp-photo-upload">
      <div className="emp-photo-frame" style={{ width: size, height: size }}>
        <EmployeeAvatar name={name || '?'} photoUrl={photoUrl} size={size} />
        <button
          type="button"
          className="emp-photo-cam"
          onClick={() => ref.current?.click()}
          aria-label={photoUrl ? 'Change photo' : 'Upload photo'}
          title={photoUrl ? 'Change photo' : 'Upload photo'}
          disabled={busy}
        >
          {busy ? <LoaderCircle size={14} className="lg-spin" /> : <Camera size={14} />}
        </button>
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
      </div>
      {withButtons && (
        <div className="emp-photo-side">
          <div className="emp-photo-btns">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => ref.current?.click()} disabled={busy}>
              <Camera size={13} /> {photoUrl ? 'Change photo' : 'Upload photo'}
            </button>
            {photoUrl && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(undefined)} disabled={busy}>
                <Trash2 size={13} /> Remove
              </button>
            )}
          </div>
          {hint && <small className="hi-hint">{hint}</small>}
        </div>
      )}
    </div>
  );
};
