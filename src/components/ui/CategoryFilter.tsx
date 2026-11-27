import { PII_CATEGORIES, type PiiCategory } from '../../types/ui';
import styles from './CategoryFilter.module.css';

export interface CategoryFilterProps {
  readonly enabledCategories: ReadonlySet<PiiCategory>;
  readonly onToggleCategory: (category: PiiCategory) => void;
  readonly onResetAll: () => void;
  readonly disabled?: boolean;
}

export function CategoryFilter({
  enabledCategories,
  onToggleCategory,
  onResetAll,
  disabled = false,
}: CategoryFilterProps) {
  const showReset = enabledCategories.size < PII_CATEGORIES.length;

  return (
    <div
      role="group"
      aria-label="Active PII detection categories"
      className={styles.container}
    >
      <span className={styles.label}>Detect Categories</span>
      <div className={styles.chips}>
        {PII_CATEGORIES.map((category) => {
          const isActive = enabledCategories.has(category.id);
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={isActive}
              disabled={disabled}
              onClick={() => onToggleCategory(category.id)}
              className={[
                styles.chip,
                isActive ? styles.chipActive : undefined,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className={styles.dot} aria-hidden="true" />
              <span>{category.label}</span>
            </button>
          );
        })}
        {showReset && (
          <button
            type="button"
            disabled={disabled}
            onClick={onResetAll}
            className={styles.resetButton}
          >
            Enable All
          </button>
        )}
      </div>
    </div>
  );
}
