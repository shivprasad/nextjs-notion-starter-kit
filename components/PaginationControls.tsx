import Link from 'next/link'
import * as React from 'react'

import styles from './PaginationControls.module.css'

export interface PaginationControlsProps {
  currentPage: number
  hasNext: boolean
  hasPrevious: boolean
}

export function PaginationControls({
  currentPage,
  hasNext,
  hasPrevious
}: PaginationControlsProps) {
  const previousPage = currentPage - 1
  const nextPage = currentPage + 1

  const previousUrl = previousPage === 1 ? '/' : `/?page=${previousPage}`
  const nextUrl = `/?page=${nextPage}`

  return (
    <div className={styles.paginationControls}>
      <div className={styles.pageInfo}>
        Page {currentPage}
      </div>

      <div className={styles.controls}>
        {hasPrevious ? (
          <Link href={previousUrl} className={styles.button}>
            ← Previous
          </Link>
        ) : (
          <span className={`${styles.button} ${styles.disabled}`}>
            ← Previous
          </span>
        )}

        {hasNext ? (
          <Link href={nextUrl} className={styles.button}>
            Next →
          </Link>
        ) : (
          <span className={`${styles.button} ${styles.disabled}`}>
            Next →
          </span>
        )}
      </div>
    </div>
  )
}
