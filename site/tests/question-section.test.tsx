import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QuestionSection } from '../components/QuestionSection'

const child = <div data-testid="heavy">chart</div>

describe('QuestionSection', () => {
  it('desktop: renders children untouched, no section chrome', () => {
    const { container } = render(
      <QuestionSection anchorId="h2h-h" question="Are you underpaid?" fact="f" narrow={false}>{child}</QuestionSection>,
    )
    expect(screen.getByTestId('heavy')).toBeInTheDocument()
    expect(container.querySelector('.qsec')).toBeNull()
  })

  it('narrow: children are ALWAYS mounted — there is no collapse', () => {
    render(<QuestionSection anchorId="h2h-h" question="Are you underpaid?" fact="f" narrow>{child}</QuestionSection>)
    expect(screen.getByTestId('heavy')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('narrow: poster anatomy is eyebrow question then deck sentence', () => {
    const { container } = render(
      <QuestionSection anchorId="trend-h" question="Are wages beating inflation?"
                       fact="Software Developers are down 5.7% in real terms since 2021." narrow>
        {child}
      </QuestionSection>,
    )
    expect(container.querySelector('.qsec-q')!.textContent).toBe('Are wages beating inflation?')
    expect(container.querySelector('.qsec-deck')!.textContent)
      .toBe('Software Developers are down 5.7% in real terms since 2021.')
  })

  it('narrow: the section carries the anchor id exactly once, always', () => {
    const { container } = render(
      <QuestionSection anchorId="tl-h" question="q" fact="f" narrow>
        <h2 data-testid="heading">section</h2>
      </QuestionSection>,
    )
    expect(container.querySelectorAll('#tl-h')).toHaveLength(1)
    expect(container.querySelector('#tl-h')!.classList.contains('qsec')).toBe(true)
  })

  it('narrow: body wrapper carries qsec-body so wide charts can be scoped-scrolled', () => {
    const { container } = render(
      <QuestionSection anchorId="trend-h" question="q" fact="f" narrow>{child}</QuestionSection>,
    )
    expect(container.querySelector('.qsec-body')).not.toBeNull()
  })

  it('narrow: the eyebrow is a real heading so the section is navigable', () => {
    render(<QuestionSection anchorId="h2h-h" question="Are you underpaid?" fact="f" narrow>{child}</QuestionSection>)
    expect(screen.getByRole('heading', { name: 'Are you underpaid?' })).toBeInTheDocument()
  })
})
