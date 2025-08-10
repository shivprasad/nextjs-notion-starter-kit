import { useState } from 'react'

import styles from './LoadMoreButton.module.css'

interface LoadMoreButtonProps {
  hasMore: boolean
  nextCursor?: string
  pageId: string
  collectionId?: string
  collectionViewId?: string
  onLoadMore?: (newData: any) => void
}

export function LoadMoreButton({
  hasMore,
  nextCursor,
  pageId,
  collectionId,
  collectionViewId,
  onLoadMore
}: LoadMoreButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleLoadMore = async () => {
    if (!hasMore || !nextCursor) return

    setLoading(true)

    try {
      if (onLoadMore && collectionId && collectionViewId) {
        // Option 1: Client-side loading (append data)
        const response = await fetch(
          `/api/load-more?pageId=${pageId}&cursor=${nextCursor}&collectionId=${collectionId}&collectionViewId=${collectionViewId}`
        )
        const newData = await response.json()
        onLoadMore(newData)
      } else {
        // Option 2: Page reload with cursor (as requested)
        const url = new URL(window.location.href)
        url.searchParams.set('cursor', nextCursor)
        window.location.href = url.toString()
      }
    } catch (err) {
      console.error('Error loading more content:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!hasMore) return null

  return (
    <div className={styles.loadMoreContainer}>
      <button
        onClick={handleLoadMore}
        disabled={loading}
        className={styles.loadMoreButton}
      >
        {loading ? 'Loading...' : 'Load More'}
      </button>
    </div>
  )
}
