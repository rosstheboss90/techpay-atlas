import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QuestionSection } from '../components/QuestionSection'

const child = <div data-testid="heavy">chart</div>

describe('QuestionSection', () => {
  it('desktop: renders children untouched, no section chrome', () => {
    const { container } = render(
      <QuestionSection question="Are you underpaid?" fact="f" narrow={false}>{child}</QuestionSection>,
    )
    expect(screen.getByTestId('heavy')).toBeInTheDocument()
    expect(container.querySelector('.qsec')).toBeNull()
  })

  it('narrow: children are ALWAYS mounted — there is no collapse', () => {
    render(<QuestionSection question="Are you underpaid?" fact="f" narrow>{child}</QuestionSection>)
    expect(screen.getByTestId('heavy')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('narrow: poster anatomy is eyebrow question then deck sentence', () => {
    const { container } = render(
      <QuestionSection question="Are wages beating inflation?"
                       fact="Software Developers are down 5.7% in real terms since 2021." narrow>
        {child}
      </QuestionSection>,
    )
    expect(container.querySelector('.qsec-q')!.textContent).toBe('Are wages beating inflation?')
    expect(container.querySelector('.qsec-deck')!.textContent)
      .toBe('Software Developers are down 5.7% in real terms since 2021.')
  })

  // The section itself never owns a DOM id — anchor ids live on the child content (its own
  // heading, or a div page.tsx supplies for the map section), because on desktop this component
  // renders no wrapper element at all to hang an id on. Six of the seven children already carry
  // their own `id="..."` on their own <h2>; if the section also set that id, narrow would ship
  // two elements sharing one id the moment children always mount.
  it('narrow: the section itself renders no id attribute', () => {
    const { container } = render(
      <QuestionSection question="q" fact="f" narrow>
        <h2 id="tl-h" data-testid="heading">section</h2>
      </QuestionSection>,
    )
    const section = container.querySelector('.qsec')!
    expect(section.hasAttribute('id')).toBe(false)
    expect(container.querySelectorAll('#tl-h')).toHaveLength(1)
  })

  it('narrow: body wrapper carries qsec-body so wide charts can be scoped-scrolled', () => {
    const { container } = render(
      <QuestionSection question="q" fact="f" narrow>{child}</QuestionSection>,
    )
    expect(container.querySelector('.qsec-body')).not.toBeNull()
  })

  // The eyebrow is deliberately NOT a heading: the child supplies the section's one real heading
  // (e.g. HeadToHead's own <h2 id="h2h-h">). Doubling it up on the eyebrow would ship two
  // headings with identical accessible names. `.qsec-q` still carries the question text — a
  // later task hides the child's now-redundant heading visually on narrow.
  it('narrow: the eyebrow is NOT a heading — the child owns the section\'s one heading', () => {
    const { container } = render(
      <QuestionSection question="Are you underpaid?" fact="f" narrow>{child}</QuestionSection>,
    )
    expect(screen.queryByRole('heading', { name: 'Are you underpaid?' })).not.toBeInTheDocument()
    expect(container.querySelector('.qsec-q')!.textContent).toBe('Are you underpaid?')
  })
})
