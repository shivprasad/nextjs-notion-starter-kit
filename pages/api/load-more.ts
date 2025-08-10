import type { NextApiRequest, NextApiResponse } from 'next'

import { site } from '@/lib/config'
import { getCollectionDataPaginated } from '@/lib/notion'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { pageId, cursor, collectionId, collectionViewId } = req.query

  if (!pageId || !collectionId || !collectionViewId) {
    return res.status(400).json({
      error: 'Missing required parameters: pageId, collectionId, collectionViewId'
    })
  }

  try {
    const paginatedData = await getCollectionDataPaginated(
      collectionId as string,
      collectionViewId as string,
      null, // collectionView - we'll pass null for now
      {
        cursor: cursor as string,
        limit: site.pageSize || 10,
        loadAll: false
      }
    )

    res.json(paginatedData)
  } catch (err) {
    console.error('Error in load-more API:', err)
    res.status(500).json({ error: 'Failed to load more content' })
  }
}
