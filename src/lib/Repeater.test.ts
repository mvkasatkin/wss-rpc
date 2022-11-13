import { Repeater } from './Repeater'

describe('Repeater', () => {
  jest.useFakeTimers({ timerLimit: 1000 })

  beforeEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  test('simple case', async () => {
    const setTimeoutFn = jest.spyOn(global, 'setTimeout')
    const callback = jest.fn()
    const onLimit = jest.fn()
    const repeater = new Repeater({
      callback,
      onLimit,
      limit: 3,
      intervals: [500, 1000, 1500],
    })
    repeater.start()
    jest.runAllTimers()
    await repeater.finished
    expect(onLimit).toBeCalledTimes(1)
    expect(callback).toBeCalledTimes(3)
    expect(setTimeout).toBeCalledTimes(3)
    expect(setTimeoutFn.mock.calls[0][1]).toBe(500)
    expect(setTimeoutFn.mock.calls[1][1]).toBe(1000)
    expect(setTimeoutFn.mock.calls[2][1]).toBe(1500)
  })

  test('success on second repeat', async () => {
    const callback = jest.fn()
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => { repeater.stop() })
    const onLimit = jest.fn()
    const repeater = new Repeater({
      callback,
      onLimit,
      limit: 5,
      intervals: [500, 1000, 1500],
    })
    repeater.start()
    jest.runAllTimers()
    await repeater.finished
    expect(onLimit).toBeCalledTimes(0)
    expect(callback).toBeCalledTimes(2)
    expect(setTimeout).toBeCalledTimes(2)
  })

  test('use last interval', async () => {
    const setTimeoutFn = jest.spyOn(global, 'setTimeout')
    const callback = jest.fn()
    const repeater = new Repeater({
      callback,
      limit: 5,
      intervals: [500, 1000, 1500],
    })
    repeater.start()
    jest.runAllTimers()
    await repeater.finished
    expect(callback).toBeCalledTimes(5)
    expect(setTimeout).toBeCalledTimes(5)
    expect(setTimeoutFn.mock.calls[0][1]).toBe(500)
    expect(setTimeoutFn.mock.calls[1][1]).toBe(1000)
    expect(setTimeoutFn.mock.calls[2][1]).toBe(1500)
    expect(setTimeoutFn.mock.calls[3][1]).toBe(1500)
    expect(setTimeoutFn.mock.calls[4][1]).toBe(1500)
  })

  test('disabled repeats', async () => {
    const callback = jest.fn()
    const repeater = new Repeater({
      callback,
      limit: -1,
      intervals: [500, 1000, 1500],
    })
    repeater.start()
    jest.runAllTimers()
    await repeater.finished
    expect(callback).toBeCalledTimes(0)
    expect(setTimeout).toBeCalledTimes(0)
  })

  test('limited repeats', async () => {
    const setTimeoutFn = jest.spyOn(global, 'setTimeout')
    const callback = jest.fn()
    const repeater = new Repeater({
      callback,
      limit: 1,
      intervals: [500, 1000, 1500],
    })
    repeater.start()
    jest.runAllTimers()
    await repeater.finished
    expect(callback).toBeCalledTimes(1)
    expect(setTimeout).toBeCalledTimes(1)
    expect(setTimeoutFn.mock.calls[0][1]).toBe(500)
  })

  test('unlimited repeats', async () => {
    const callback = jest.fn()
    const repeater = new Repeater({
      callback,
      limit: 0,
    })

    await expect(async () => {
      repeater.start()
      jest.runAllTimers()
      await repeater.finished
    }).rejects.toThrow('Aborting after running 1000 timers, assuming an infinite loop!')

    expect(callback).toBeCalledTimes(1000)
  })
})
