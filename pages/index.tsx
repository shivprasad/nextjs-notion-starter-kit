import type { GetServerSideProps } from 'next'

import { NotionPage } from '@/components/NotionPage'
import { domain } from '@/lib/config'
import { resolveNotionPage } from '@/lib/resolve-notion-page'

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { cursor, loadAll } = context.query

  try {
    // Always pass pagination options to enable pagination by default
    const paginationOptions = {
      cursor: cursor as string,
      loadAll: loadAll === 'true'
    }

    const props = await resolveNotionPage(domain, undefined, paginationOptions)

    return { props }
  } catch (err) {
    console.error('page error', domain, err)
    throw err
  }
}

export default function NotionDomainPage(props) {
  return <NotionPage {...props} />
}
