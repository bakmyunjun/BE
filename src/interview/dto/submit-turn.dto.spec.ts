import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SubmitTurnDto } from './submit-turn.dto';

describe('SubmitTurnDto', () => {
  const basePayload = {
    turnIndex: 1,
    answerDuration: 10,
  };

  it('accepts empty answerText', () => {
    const dto = plainToInstance(SubmitTurnDto, {
      ...basePayload,
      answerText: '',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts whitespace-only answerText', () => {
    const dto = plainToInstance(SubmitTurnDto, {
      ...basePayload,
      answerText: '   ',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects null answerText', () => {
    const dto = plainToInstance(SubmitTurnDto, {
      ...basePayload,
      answerText: null,
    });

    const errors = validateSync(dto);

    expect(errors.some((error) => error.property === 'answerText')).toBe(true);
  });

  it('rejects missing answerText', () => {
    const dto = plainToInstance(SubmitTurnDto, {
      ...basePayload,
    });

    const errors = validateSync(dto);

    expect(errors.some((error) => error.property === 'answerText')).toBe(true);
  });

  it('accepts normal answerText', () => {
    const dto = plainToInstance(SubmitTurnDto, {
      ...basePayload,
      answerText: 'nestjs dependency injection',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
  });
});
