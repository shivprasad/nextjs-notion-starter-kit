// External libraries
import ky from 'ky'
import {
  type ExtendedRecordMap,
  type SearchParams,
  type SearchResults
} from 'notion-types'
import { mergeRecordMaps } from 'notion-utils'
import pMap from 'p-map'
import pMemoize from 'p-memoize'

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
          concurrency: 4
        }
      )
    }

    return []
  }
)

export async function getPage(pageId: string): Promise<ExtendedRecordMap> {
  let recordMap = await notion.getPage(pageId)

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
    { concurrency: 4 } // Process 4 blocks concurrently
  )

  return recordMap
}
