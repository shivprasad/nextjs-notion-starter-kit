import type { GetServerSideProps } from 'next'

import { NotionPage } from '@/components/NotionPage'
import { domain } from '@/lib/config'
import { resolveNotionPage } from '@/lib/resolve-notion-page'

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { page, loadAll } = context.query

  try {
    // Convert page number to pagination options
    const pageNumber = page ? Number.parseInt(page as string, 10) : 1
    const paginationOptions = {
      page: pageNumber,
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
