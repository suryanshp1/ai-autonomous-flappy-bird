import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';
import { GameTelemetryPayload } from './dtos/game-telemetry.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly gameService: GameService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    client.emit('connection_ack', {
      status: 'connected',
      clientId: client.id,
      timestamp: Date.now(),
      metrics: this.gameService.getMetrics(),
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('state_tick')
  async handleStateTick(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: GameTelemetryPayload,
  ) {
    if (!data || !data.bird) {
      return;
    }

    try {
      const decision = await this.gameService.processGameTick(data);
      // Immediately reply to this client with action decision
      client.emit('action_decision', decision);
    } catch (err: any) {
      this.logger.error(`Error processing state tick: ${err.message}`, err.stack);
    }
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() data: { clientTimestamp: number }) {
    client.emit('pong', {
      clientTimestamp: data.clientTimestamp,
      serverTimestamp: Date.now(),
    });
  }

  @SubscribeMessage('get_stats')
  handleGetStats(@ConnectedSocket() client: Socket) {
    client.emit('stats_update', this.gameService.getMetrics());
  }

  @SubscribeMessage('reset_stats')
  handleResetStats(@ConnectedSocket() client: Socket) {
    this.gameService.resetMetrics();
    client.emit('stats_update', this.gameService.getMetrics());
  }
}
