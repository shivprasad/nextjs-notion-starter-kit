import type { CollectionViewBlock, CollectionViewPageBlock, PageBlock } from 'notion-types'
import type { NotionContext } from 'react-notion-x'
import * as React from 'react'
import { Collection } from 'react-notion-x/build/third-party/collection'

import type * as types from '@/lib/types'

import { PaginationControls } from './PaginationControls'

export interface CollectionWithPaginationProps {
  block: CollectionViewBlock | CollectionViewPageBlock | PageBlock
  ctx: NotionContext
  className?: string
  paginationMeta?: types.PaginationMeta
  page?: number
  enablePagination?: boolean
}

export function CollectionWithPagination({
  paginationMeta,
  page,
  enablePagination,
  block,
  ctx,
  className
}: CollectionWithPaginationProps) {
  // Add pagination controls after the collection if pagination is enabled
  const paginationControls = React.useMemo(() => {
    if (!enablePagination || !paginationMeta) return null

    return (
      <PaginationControls
        currentPage={paginationMeta.currentPage || page || 1}
        hasNext={paginationMeta.hasMore}
        hasPrevious={paginationMeta.hasPrevious || false}
      />
    )
  }, [paginationMeta, page, enablePagination])

  return (
    <>
      <Collection block={block} ctx={ctx} className={className} />
      {paginationControls}
    </>
  )
}
