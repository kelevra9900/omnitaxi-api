import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/prisma/prisma.service';
import { Role } from 'generated/prisma/enums';
import { CreateUserDto } from '../users/dto/create-user.dto';

export type JwtPayload = { sub: string; email: string; role: Role };

export type ValidatedUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
};

/** Usuario recién creado en DB (incluye password hasheado) */
type CreatedUser = ValidatedUser & { password: string };

/** Delegate de Prisma User para tipar la llamada cuando el cliente generado no se resuelve */
interface PrismaUserFindUniqueDelegate {
  findUnique(args: { where: { email: string } }): Promise<CreatedUser | null>;
}

interface PrismaUserCreateDelegate {
  create(args: {
    data: {
      name: string;
      email: string;
      password: string;
      role: Role;
    };
  }): Promise<CreatedUser>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<ValidatedUser | null> {
    const prismaUser = (this.prisma as unknown as { user: PrismaUserFindUniqueDelegate }).user;
    const user: CreatedUser | null = await prismaUser.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user || !user.isActive) return null;
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    };
  }

  login(user: ValidatedUser): { access_token: string; user: ValidatedUser } {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const access_token = this.jwtService.sign(payload);
    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
      },
    };
  }

  async register(
    createUserDto: CreateUserDto,
  ): Promise<{ access_token: string; user: ValidatedUser }> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const prismaUser = (this.prisma as unknown as { user: PrismaUserCreateDelegate }).user;
    if (!prismaUser) {
      throw new Error('Prisma user delegate not found');
    }
    const user = await prismaUser.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email.toLowerCase(),
        password: hashedPassword,
        role: createUserDto.role ?? Role.PASSENGER,
      },
    });

    const validatedUser: ValidatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    };
    return this.login(validatedUser);
  }

  /**
   * Genera un nuevo access_token a partir del usuario ya validado (p. ej. desde refresh).
   */
  refreshFromValidatedUser(user: ValidatedUser): { access_token: string; user: ValidatedUser } {
    return this.login(user);
  }
}
