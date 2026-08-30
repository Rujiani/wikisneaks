import { describe, it, expect } from 'vitest'
import * as z from 'zod'

import { userParamsSchema } from '../src/schemas/user.schemas.js'
import { registerBodySchema } from '../src/schemas/auth.schemas.js'

function expectSuccess(schema: z.ZodType, input: unknown, data: unknown) {
    expect(schema.safeParse(input)).toMatchObject({ success: true, data })
}

function expectFailure(
    schema: z.ZodType,
    input: unknown,
    path: PropertyKey[],
    code?: z.core.$ZodIssueCode,
) {
    const result = schema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
        const issue = result.error.issues.find((item) => item.path.join('.') === path.join('.'))
        expect(issue).toBeDefined()
        if (code !== undefined) {
            expect(issue?.code).toBe(code)
        }
    }
}

describe('UserParamsSchema', () => {
    it.each([
        [{ userId: '123' }, { userId: 123 }],
        [{ userId: 456 }, { userId: 456 }],
        [{ userId: 1 }, { userId: 1 }],
    ])('coerces %j to %j', (input, data) => {
        expectSuccess(userParamsSchema, input, data)
    })

    it.each([
        [{ id: '3682136128' }, 'invalid_type'],
        [{}, 'invalid_type'],
        [{ userId: 0 }, 'too_small'],
        [{ userId: -10 }, 'too_small'],
        [{ userId: 'notanumber' }, 'invalid_type'],
    ] as const)('rejects %j', (input, code) => {
        expectFailure(userParamsSchema, input, ['userId'], code)
    })
})

const validRegisterBody = {
    login: 'validuser',
    password: 'Password1!ab',
}

describe('RegisterBodySchema', () => {
    it('accepts a valid body', () => {
        expectSuccess(registerBodySchema, validRegisterBody, validRegisterBody)
    })

    it('strips unknown fields such as email', () => {
        const result = registerBodySchema.safeParse({
            ...validRegisterBody,
            email: 'user@example.com',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data).toEqual(validRegisterBody)
            expect(result.data).not.toHaveProperty('email')
        }
    })

    it.each(['login', 'password'] as const)('rejects a missing %s', (field) => {
        const { [field]: _, ...rest } = validRegisterBody
        expectFailure(registerBodySchema, rest, [field], 'invalid_type')
    })

    describe('login', () => {
        it.each([
            ['abcde', 'abcde'],
            ['a'.repeat(64), 'a'.repeat(64)],
            ['User_name.1-ok', 'User_name.1-ok'],
            ['  validuser  ', 'validuser'],
        ])('accepts %j as %j', (login, expected) => {
            expectSuccess(registerBodySchema, { ...validRegisterBody, login }, {
                ...validRegisterBody,
                login: expected,
            })
        })

        it.each([
            ['abcd', 'too_small'],
            ['a'.repeat(65), 'too_big'],
            ['     ', 'too_small'],
            ['1invalid', 'invalid_format'],
            ['.login', 'invalid_format'],
            ['_login', 'invalid_format'],
            ['-login', 'invalid_format'],
            ['логинuser', 'invalid_format'],
        ] as const)('rejects %j', (login, code) => {
            expectFailure(registerBodySchema, { ...validRegisterBody, login }, ['login'], code)
        })

        it('reports the login length message', () => {
            const result = registerBodySchema.safeParse({ ...validRegisterBody, login: 'abcd' })
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe(
                    'Login must be between 5 and 64 characters',
                )
            }
        })
    })

    describe('password', () => {
        it('accepts a 12-character password that meets all rules', () => {
            expectSuccess(
                registerBodySchema,
                { ...validRegisterBody, password: 'Passw0rd!xyz' },
                { ...validRegisterBody, password: 'Passw0rd!xyz' },
            )
        })

        it.each([
            ['Passw0r!ab', 'too_small'], // 11 chars
            ['PASSWORD1!AB', 'invalid_format'], // no lowercase
            ['password1!ab', 'invalid_format'],
            ['Password!!ab', 'invalid_format'],
            ['Password12ab', 'invalid_format'],
        ] as const)('rejects %s', (password, code) => {
            expectFailure(registerBodySchema, { ...validRegisterBody, password }, ['password'], code)
        })

        it('reports the password minimum length message', () => {
            const result = registerBodySchema.safeParse({
                ...validRegisterBody,
                password: 'Pass1!',
            })
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe(
                    'Password must be at least 12 characters long',
                )
            }
        })
    })
})
