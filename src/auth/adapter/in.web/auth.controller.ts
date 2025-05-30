import {
  Body,
  Controller,
  Inject,
  Post,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterUsecase } from '../../application/port/in/auth.registerUseCase';
import { CreateRandomNumDto } from '../../dto/create-random-num-dto';
import { UserInterface } from '../../domain/interface/userInterface';
import { CreateRandomNumRequestDto } from '../../dto/create-random-num-request-dto';
import { CreatePreReservationDto } from '../../dto/create-pre-reservation-dto';
import { AdminLoginUsecase } from '../../../admin/application/port/in/admin.login.usecase';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject('RegisterUsecase')
    private readonly registerUsecase: RegisterUsecase,
    @Inject('AdminLoginUsecase')
    private readonly adminLoginUsecase: AdminLoginUsecase,
  ) {}

  /*
   * @Body CreateRandomNumRequestDto
   * @Return CreateRandomNumDto
   *
   *  인증번호를 발급 해주는 메소드
   * */
  @Post('code')
  async generateRandom6Digit(
    @Body() createRandomNumRequest: CreateRandomNumRequestDto,
  ): Promise<CreateRandomNumDto> {
    return this.registerUsecase.generateRandomCode(createRandomNumRequest);
  }

  /*
   * @Param randomId
   * @Return CreateRandomNumDto
   *
   *  입력 받은 번호가 올바른 번호인지 확인
   * */
  @Post('verify')
  async register(@Body('randomId') randomId: string): Promise<any> {
    let response: Record<string, any>;
    const verifyValue = await this.registerUsecase.verifyAuthCode(randomId);
    if (verifyValue.chkval) {
      const newVar = await this.registerUsecase.createUser(verifyValue.dto);
      if (verifyValue.scheduleId != 0) {
        const newSchedule = new CreatePreReservationDto(
          newVar.randomId,
          verifyValue.scheduleId,
          newVar.adCnt,
          newVar.cdCnt,
        );
        this.registerUsecase.reservationPreReservation(newSchedule);
      }

      const token = await this.registerUsecase.generateAuth(randomId);
      response = {
        ...token,
        guardians: verifyValue.dto.adCnt,
        visitors: verifyValue.dto.cdCnt,
      };
    } else {
      response = {
        message: 'Invalid verification code',
      };
    }
    return response;
  }

  /*
   * @Body token
   * @Return CreateRandomNumDto
   *
   *  입력 받은 토큰이 유효한 토큰인지 확인 (Body)
   * */
  @Post('validate/token')
  async validateToken(@Body('token') token: string): Promise<boolean> {
    // JWT 토큰 검증
    const chkVal: { valid: boolean; id?: string; isAdmin?: boolean } =
      await this.registerUsecase.validateAuth(token);
    // 토큰이 유효한 경우 service로 빼기
    if (chkVal.valid && !chkVal.isAdmin) {
      // id 값으로 사용자 조회
      const chkUser: UserInterface = await this.registerUsecase.findUserById({
        randomId: chkVal.id,
      });
      //사용자가 존재하면 true, 없으면 false 반환
      return !!chkUser;
    } else if (chkVal.valid && chkVal.isAdmin) {
      const chkAdmin = await this.adminLoginUsecase.existByid(chkVal.id);
      return !!chkAdmin;
    }
    // 토큰이 유효하지 않으면 false 반환
    return false;
  }

  /*
   * @Header authorization Baerer Token
   * @Return CreateRandomNumDto
   *
   *  입력 받은 토큰이 유효한 토큰인지 확인 (Header)
   * */
  @Post('verify/header')
  async verifyTokenFromHeader(@Headers('authorization') authHeader: string) {
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing');
    }
    // "Bearer " 부분 제거 후 JWT 토큰 추출
    const token = authHeader.replace('Bearer ', '').trim();

    // JWT 검증 및 ID 추출
    const chkVal: { valid: boolean; id?: string } =
      await this.registerUsecase.validateAuth(token);

    if (!chkVal.valid || !chkVal.id) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return { userId: chkVal.id };
  }

  /*
   * @Body refreshToken
   * @Return CreateRandomNumDto
   *
   *  refreshToken을 통한 accessToken , RefreshToken 재발급
   * */
  @Post('reissue')
  async reissueAccessToken(@Body('refreshToken') token: string) {
    // JWT 토큰 검증
    const chkVal: { valid: boolean; id?: string } =
      await this.registerUsecase.validateRefreshToken(token);
    if (chkVal.valid) {
      // id 값으로 사용자 조회
      const chkUser: UserInterface = await this.registerUsecase.findUserById({
        randomId: chkVal.id,
      });
      return this.registerUsecase.generateAuth(chkUser.randomId);
    }
  }
}
