// External libraries
import ky from 'ky'
import {
  type CollectionInstance,
  type ExtendedRecordMap,
  type SearchParams,
  type SearchResults
} from 'notion-types'
import { mergeRecordMaps } from 'notion-utils'
import pMap from 'p-map'
import pMemoize from 'p-memoize'

import type { PaginationMeta } from './types'
// Local modules
import {
  defaultFallbackImage,
  isPreviewImageSupportEnabled,
  navigationLinks,
  navigationStyle
} from './config'
import { getTweetsMap } from './get-tweets'
import { notion } from './notion-api'
import { getPreviewImageMap } from './preview-images'

const getNavigationLinkPages = pMemoize(
  async (): Promise<ExtendedRecordMap[]> => {
    const navigationLinkPageIds = (navigationLinks || [])
      .map((link) => link.pageId)
      .filter(Boolean)

    if (navigationStyle !== 'default' && navigationLinkPageIds.length) {
      return pMap(
        navigationLinkPageIds,
        async (navigationLinkPageId) =>
          notion.getPage(navigationLinkPageId, {
            chunkLimit: 1,
            fetchMissingBlocks: false,
            fetchCollections: false,
            signFileUrls: false
          }),
        {
          concurrency: 1
        }
      )
    }

    return []
  }
)

export async function getPage(pageId: string): Promise<ExtendedRecordMap> {
  // Retry logic for 429 errors
  let retries = 3
  let recordMap: ExtendedRecordMap

  while (retries > 0) {
    try {
      recordMap = await notion.getPage(pageId)
      break
    } catch (err: any) {
      const is429Error = err.message?.includes('429') ||
                         err.message?.includes('Too Many Requests') ||
                         err.status === 429

      if (is429Error && retries > 1) {
        const delay = Math.pow(2, 4 - retries) * 2000 // 2s, 4s, 8s
        console.warn(`Rate limited for page ${pageId}, retrying in ${delay}ms... (${retries - 1} retries left)`)
        await new Promise(resolve => setTimeout(resolve, delay))
        retries--
        continue
      }

      throw err
    }
  }

  // Replace dead image links before other processing
  recordMap = await replaceDeadImageLinks(recordMap)

  if (navigationStyle !== 'default') {
    // ensure that any pages linked to in the custom navigation header have
    // their block info fully resolved in the page record map so we know
    // the page title, slug, etc.
    const navigationLinkRecordMaps = await getNavigationLinkPages()

    if (navigationLinkRecordMaps?.length) {
      recordMap = navigationLinkRecordMaps.reduce(
        (map, navigationLinkRecordMap) =>
          mergeRecordMaps(map, navigationLinkRecordMap),
        recordMap
      )
    }
  }

  if (isPreviewImageSupportEnabled) {
    const previewImageMap = await getPreviewImageMap(recordMap)
    ;(recordMap as any).preview_images = previewImageMap
  }

  await getTweetsMap(recordMap)

  return recordMap
}

export async function search(params: SearchParams): Promise<SearchResults> {
  return notion.search(params)
}

// New function for paginated collection data
export async function getCollectionDataPaginated(
  collectionId: string,
  collectionViewId: string,
  collectionView: any,
  options: {
    limit?: number
    cursor?: string
    loadAll?: boolean
  } = {}
): Promise<{
  data: CollectionInstance
  hasMore: boolean
  nextCursor?: string
}> {
  const { limit = 10, loadAll = false } = options

  try {
    const collectionData = await notion.getCollectionData(
      collectionId,
      collectionViewId,
      collectionView,
      {
        limit: loadAll ? undefined : limit,
        // Note: The notion-client may not support cursor-based pagination directly
        // This is a simplified implementation that may need adjustment based on actual API capabilities
      }
    )

    // For now, we'll simulate pagination logic
    // In a real implementation, you'd need to work with the actual Notion API pagination
    const hasMore = !loadAll && collectionData && Object.keys(collectionData.result?.blockIds || {}).length >= limit

    return {
      data: collectionData,
      hasMore,
      nextCursor: hasMore ? `cursor_${Date.now()}` : undefined
    }
  } catch (err) {
    console.error('Error fetching paginated collection data:', err)
    throw err
  }
}

// Enhanced getPage function with pagination support
export async function getPageWithPagination(
  pageId: string,
  paginationOptions?: {
    cursor?: string
    pageSize?: number
    loadAll?: boolean
  }
): Promise<ExtendedRecordMap & { paginationMeta?: PaginationMeta }> {
  const recordMap = await getPage(pageId)

  // If no pagination options provided, return the standard record map
  if (!paginationOptions) {
    return recordMap
  }

  const { cursor, pageSize = 10, loadAll = false } = paginationOptions

  // If loadAll is true, don't apply pagination
  if (loadAll) {
    const paginationMeta: PaginationMeta = {
      hasMore: false,
      nextCursor: null,
      currentPage: 1
    }
    return { ...recordMap, paginationMeta }
  }

  // Apply pagination to collections in the recordMap
  const paginatedRecordMap = { ...recordMap }
  let hasMore = false
  let nextCursor: string | undefined

  // Find collection views and apply pagination
  console.log('DEBUG: recordMap.collection_query exists:', !!recordMap.collection_query)
  if (recordMap.collection_query) {
    console.log('DEBUG: collection_query keys:', Object.keys(recordMap.collection_query))

    for (const [collectionId, collectionQuery] of Object.entries(recordMap.collection_query)) {
      console.log('DEBUG: Processing collection:', collectionId)
      console.log('DEBUG: collectionQuery keys:', Object.keys(collectionQuery))

      for (const [viewId, queryResult] of Object.entries(collectionQuery)) {
        console.log('DEBUG: Processing view:', viewId)
        console.log('DEBUG: queryResult:', queryResult)
        console.log('DEBUG: collection_group_results type:', typeof queryResult?.collection_group_results)
        console.log('DEBUG: collection_group_results is array:', Array.isArray(queryResult?.collection_group_results))

        if (queryResult?.collection_group_results) {
          const groupResult = queryResult.collection_group_results
          console.log('DEBUG: Processing group result:', groupResult)

          if (groupResult.blockIds) {
            const startIndex = cursor ? Number.parseInt(cursor) : 0
            const endIndex = startIndex + pageSize
            const totalItems = groupResult.blockIds.length

            console.log('DEBUG: Pagination info:', { startIndex, endIndex, totalItems, pageSize })

            // Slice the blockIds for pagination
            const paginatedBlockIds = groupResult.blockIds.slice(startIndex, endIndex)

            // Update the collection query result
            groupResult.blockIds = paginatedBlockIds
            ;(groupResult as any).total = paginatedBlockIds.length

            // Determine if there are more items
            hasMore = endIndex < totalItems
            nextCursor = hasMore ? endIndex.toString() : undefined

            console.log('DEBUG: Pagination result:', { hasMore, nextCursor, paginatedCount: paginatedBlockIds.length })

            // Keep all blocks except the collection items that are not in current page
            if (recordMap.block) {
              const blocksToRemove = new Set<string>()

              // Find all collection item blocks that should be removed
              for (const [blockId, blockData] of Object.entries(recordMap.block)) {
                if (blockData.value?.parent_id &&
                    blockData.value?.type !== 'page' &&
                    !paginatedBlockIds.includes(blockId)) {
                  // This is a collection item block not in current page
                  const parentBlock = recordMap.block[blockData.value.parent_id]
                  if (parentBlock?.value?.type === 'collection_view' ||
                      parentBlock?.value?.type === 'collection_view_page') {
                    blocksToRemove.add(blockId)
                  }
                }
              }

              // Create new block map without the removed blocks
              const newBlockMap: any = {}
              for (const [blockId, blockData] of Object.entries(recordMap.block)) {
                if (!blocksToRemove.has(blockId)) {
                  newBlockMap[blockId] = blockData
                }
              }
              paginatedRecordMap.block = newBlockMap
            }
          }
        }
      }
    }
  }

  const paginationMeta: PaginationMeta = {
    hasMore,
    nextCursor: nextCursor || null,
    currentPage: cursor ? Math.floor(Number.parseInt(cursor) / pageSize) + 1 : 1
  }

  return { ...paginatedRecordMap, paginationMeta }
}

async function replaceDeadImageLinks(recordMap: ExtendedRecordMap): Promise<ExtendedRecordMap> {
  if (!recordMap?.block || !defaultFallbackImage) {
    return recordMap
  }

  const blockIds = Object.keys(recordMap.block)

  await pMap(
    blockIds,
    async (blockId) => {
      const blockWrapper = recordMap.block[blockId]
      if (!blockWrapper?.value) {
        return
      }

      const block = blockWrapper.value

      if (block.type === 'image') {
        const originalSource = block.properties?.source?.[0]?.[0]
        if (!originalSource) {
          return // No source URL to check
        }

        // Use the originalSource directly, or mapImageUrl if complex mapping is needed in the future.
        // For now, direct check of originalSource (after Notion's potential signing) is sufficient
        // as mapImageUrl in this project primarily handles defaultPageCover/Icon or passes to notion-utils.
        const imageUrlToCheck = originalSource // Simpler: check the source URL from Notion
        if (!imageUrlToCheck) {
          return // No source URL to check
        }

        try {
          // Perform a HEAD request to check if the image is accessible
          await ky.head(imageUrlToCheck, { timeout: 5000 }) // 5s timeout
        } catch (err) {
          // Assuming any error (network, 404, timeout) means the image is "dead"
          console.warn(
            `Dead image link detected: ${imageUrlToCheck} for block ${block.id}. Replacing with fallback. Error: ${(err as Error).message}`
          )
          // Update block properties, preserving caption if it exists
          const existingCaption = block.properties?.caption
          block.properties = { source: [[defaultFallbackImage]] }
          if (existingCaption) {
            block.properties.caption = existingCaption
          }
        }
      }
    },
    { concurrency: 1 } // Process 1 block at a time to avoid rate limiting
  )

  return recordMap
}
