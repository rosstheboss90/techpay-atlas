import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuestionSection } from '../components/QuestionSection'

const child = <div data-testid="heavy">chart</div>

describe('QuestionSection', () => {
  it('desktop: renders children untouched, no card chrome', () => {
    render(<QuestionSection anchorId="h2h-h" question="Are you underpaid?" teaser="t" narrow={false}>{child}</QuestionSection>)
    expect(screen.getByTestId('heavy')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('narrow: collapsed card, children NOT mounted, aria wired', async () => {
    render(<QuestionSection anchorId="h2h-h" question="Are you underpaid?" teaser="Type your offer" narrow>{child}</QuestionSection>)
    expect(screen.queryByTestId('heavy')).not.toBeInTheDocument()
    const btn = screen.getByRole('button', { name: /Are you underpaid\?/ })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(btn).toHaveAttribute('aria-controls', 'h2h-h-body')
    await userEvent.click(btn)
    expect(screen.getByTestId('heavy')).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(btn)
    expect(screen.queryByTestId('heavy')).not.toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-expanded', 'false')
  })

  it('narrow: initialOpen mounts children from the start (hash deep-link)', () => {
    render(<QuestionSection anchorId="rsim-h" question="What else?" teaser="t" narrow initialOpen>{child}</QuestionSection>)
    expect(screen.getByTestId('heavy')).toBeInTheDocument()
  })

  it('collapsed card carries the anchor id so nav/hash targets resolve', () => {
    const { container } = render(<QuestionSection anchorId="rsim-h" question="q" teaser="t" narrow>{child}</QuestionSection>)
    expect(container.querySelector('#rsim-h')).not.toBeNull()
  })

  it('anchor id is never duplicated: card owns it collapsed, child owns it open', async () => {
    const { container } = render(
      <QuestionSection anchorId="tl-h" question="q" teaser="t" narrow>
        <h2 id="tl-h" data-testid="heading">section</h2>
      </QuestionSection>,
    )
    expect(container.querySelectorAll('#tl-h')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button'))
    expect(container.querySelectorAll('#tl-h')).toHaveLength(1)
    expect(screen.getByTestId('heading')).toBeInTheDocument()
  })
})
