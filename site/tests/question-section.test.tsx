import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuestionSection } from '../components/QuestionSection'

const child = <div data-testid="heavy">chart</div>

describe('QuestionSection', () => {
  describe('narrow deep-link scroll', () => {
    const original = Element.prototype.scrollIntoView

    afterEach(() => {
      Element.prototype.scrollIntoView = original
    })

    it('scrolls once when the card first renders narrow+open, not on the desktop-first mount', () => {
      const spy = vi.fn()
      Element.prototype.scrollIntoView = spy
      const { rerender } = render(
        <QuestionSection anchorId="rsim-h" question="What else?" fact="f" context="c" narrow={false} initialOpen>{child}</QuestionSection>,
      )
      expect(spy).not.toHaveBeenCalled()
      rerender(
        <QuestionSection anchorId="rsim-h" question="What else?" fact="f" context="c" narrow initialOpen>{child}</QuestionSection>,
      )
      expect(spy).toHaveBeenCalledTimes(1)
    })
  })


  it('desktop: renders children untouched, no card chrome', () => {
    render(<QuestionSection anchorId="h2h-h" question="Are you underpaid?" fact="f" context="c" narrow={false}>{child}</QuestionSection>)
    expect(screen.getByTestId('heavy')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('narrow: collapsed card, children NOT mounted, aria wired', async () => {
    render(<QuestionSection anchorId="h2h-h" question="Are you underpaid?" fact="Type your offer" context="here" narrow>{child}</QuestionSection>)
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
    render(<QuestionSection anchorId="rsim-h" question="What else?" fact="f" context="c" narrow initialOpen>{child}</QuestionSection>)
    expect(screen.getByTestId('heavy')).toBeInTheDocument()
  })

  it('collapsed card carries the anchor id so nav/hash targets resolve', () => {
    const { container } = render(<QuestionSection anchorId="rsim-h" question="q" fact="f" context="c" narrow>{child}</QuestionSection>)
    expect(container.querySelector('#rsim-h')).not.toBeNull()
  })

  it('anchor id is never duplicated: card owns it collapsed, child owns it open', async () => {
    const { container } = render(
      <QuestionSection anchorId="tl-h" question="q" fact="f" context="c" narrow>
        <h2 id="tl-h" data-testid="heading">section</h2>
      </QuestionSection>,
    )
    expect(container.querySelectorAll('#tl-h')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button'))
    expect(container.querySelectorAll('#tl-h')).toHaveLength(1)
    expect(screen.getByTestId('heading')).toBeInTheDocument()
  })

  it('card anatomy: eyebrow question, large fact, context, aria-hidden viz', () => {
    const { container } = render(
      <QuestionSection anchorId="trend-h" question="Is it holding up?" fact="−5.7% real"
                       context="since 2021" narrow viz={<svg data-testid="spark" />}>
        {child}
      </QuestionSection>,
    )
    const btn = container.querySelector('.qcard-btn')!
    expect(btn.querySelector('.qcard-q')!.textContent).toBe('Is it holding up?')
    expect(btn.querySelector('.qcard-fact')!.textContent).toBe('−5.7% real')
    expect(btn.querySelector('.qcard-ctx')!.textContent).toBe('since 2021')
    const viz = btn.querySelector('.qcard-viz')!
    expect(viz).toHaveAttribute('aria-hidden', 'true')
    expect(viz.querySelector('[data-testid="spark"]')).not.toBeNull()
  })

  it('body container carries qcard-body so wide expanded content (charts) can be contained/scrolled', () => {
    const { container } = render(
      <QuestionSection anchorId="trend-h" question="Is it holding up?" fact="f" context="c" narrow initialOpen>
        {child}
      </QuestionSection>,
    )
    expect(container.querySelector('#trend-h-body')!.classList.contains('qcard-body')).toBe(true)
  })

  it('empty context and absent viz render no empty containers', () => {
    const { container } = render(
      <QuestionSection anchorId="tl-h" question="q" fact="f" context="" narrow>{child}</QuestionSection>,
    )
    expect(container.querySelector('.qcard-ctx')).toBeNull()
    expect(container.querySelector('.qcard-viz')).toBeNull()
  })
})
