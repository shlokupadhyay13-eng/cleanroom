import { useId } from 'react';
import { REDACTION_MODES, type RedactionMode } from '../../types/ui';
import styles from './ModeSelector.module.css';

export interface ModeSelectorProps {
  value: RedactionMode;
  onChange: (mode: RedactionMode) => void;
  disabled?: boolean;
}

export function ModeSelector({
  value,
  onChange,
  disabled = false,
}: ModeSelectorProps) {
  const groupName = useId();
  const labelId = useId();

  return (
    <div className={styles.wrapper}>
      <span id={labelId} className={styles.groupLabel}>
        Redaction Mode
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className={styles.group}
      >
        {REDACTION_MODES.map((option) => {
          const isSelected = option.id === value;
          const optionClasses = [
            styles.option,
            isSelected ? styles.selected : undefined,
            disabled ? styles.disabled : undefined,
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <label key={option.id} className={optionClasses}>
              <input
                type="radio"
                name={groupName}
                value={option.id}
                checked={isSelected}
                disabled={disabled}
                onChange={() => onChange(option.id)}
                className={styles.radioInput}
              />
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>{option.label}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
