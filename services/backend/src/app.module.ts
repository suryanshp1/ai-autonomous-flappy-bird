import { Module, Controller, Get } from '@nestjs/common';
import { GameGateway } from './game/game.gateway';
import { GameService } from './game/game.service';
import { DeadReckoningService } from './laya/dead-reckoning.service';
import { LayaClientService } from './laya/laya.client';

@Controller()
export class AppController {
  constructor(private readonly gameService: GameService) {}

  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      service: 'flappy-backend-gateway',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('stats')
  getStats() {
    return this.gameService.getMetrics();
  }
}

@Module({
  imports: [],
  controllers: [AppController],
  providers: [
    GameGateway,
    GameService,
    DeadReckoningService,
    LayaClientService,
  ],
})
export class AppModule {}
